import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'

// Use a current general-purpose Groq model for chat-style planning.
// This replaces the deprecated `llama3-8b-8192` model.
const MODEL_NAME = process.env.GROQ_MODEL_NAME || 'llama-3.1-8b-instant'

const groqClient =
  process.env.GROQ_API_KEY &&
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  })

interface GenerateStudyPlanBody {
  courseId?: string
  courseName?: string
  topic?: string
  totalDays?: number
  hoursPerDay?: number
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { data, error } = await admin
      .from('student_study_plans')
      .select(
        `
        id,
        topic,
        total_days,
        hours_per_day,
        created_at,
        course:courses (
          id,
          code,
          name
        ),
        items:student_study_plan_items (
          id,
          day_number,
          main_topic,
          tasks,
          is_completed
        )
      `
      )
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const plans = (data || []).map((plan: any) => {
      const items = (plan.items || []).sort(
        (a: any, b: any) => a.day_number - b.day_number
      )
      const totalItems = items.length
      const completedItems = items.filter((i: any) => i.is_completed).length
      const progress =
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

      return {
        id: plan.id,
        topic: plan.topic,
        totalDays: plan.total_days,
        hoursPerDay: Number(plan.hours_per_day),
        createdAt: plan.created_at,
        course: plan.course,
        items,
        progress,
        completedItems,
        totalItems,
      }
    })

    return NextResponse.json({ plans })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as GenerateStudyPlanBody
    const { courseId, courseName, topic, totalDays, hoursPerDay } = body

    if (!courseId || !topic || !totalDays || !hoursPerDay) {
      return NextResponse.json(
        { error: 'courseId, topic, totalDays, and hoursPerDay are required' },
        { status: 400 }
      )
    }

    if (!groqClient) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not configured on the server' },
        { status: 500 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // Verify user is a student and enrolled in the course
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: registration } = await admin
      .from('course_registrations')
      .select('id')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .eq('status', 'enrolled')
      .maybeSingle()

    if (!registration) {
      return NextResponse.json(
        { error: 'You are not enrolled in this course' },
        { status: 403 }
      )
    }

    const prompt = buildStudyPlanPrompt({
      courseName: courseName || '',
      topic,
      totalDays,
      hoursPerDay,
    })

    const completion = await groqClient.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content:
            'You are an educational planner that creates concise, practical study plans. Only include study topics and tasks, no quizzes, tests, or exams. Do NOT reference specific chapter numbers, section numbers, page numbers, or named resources (like "Chapter 5", "video 6.1", or a textbook title); instead, describe what to study in generic terms (e.g., "read about classes in C++" or "review inheritance examples").',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2048,
      // Ask Groq to return strict JSON
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { error: 'No study plan generated' },
        { status: 500 }
      )
    }

    let parsed: any
    try {
      parsed = safeParseJson(content)
    } catch {
      return NextResponse.json(
        { error: 'Unable to parse study plan from AI response' },
        { status: 500 }
      )
    }

    const rawDays: any[] = Array.isArray(parsed.days) ? parsed.days : []
    if (rawDays.length === 0) {
      return NextResponse.json(
        { error: 'Study plan response did not contain any days' },
        { status: 500 }
      )
    }

    const days = rawDays
      .map((d, idx) => {
        const dayNumber = Number(d.dayNumber ?? d.day ?? idx + 1)
        const mainTopic = String(d.mainTopic ?? d.title ?? '').trim()
        const tasksArray = Array.isArray(d.tasks)
          ? d.tasks.map((t: any) => String(t).trim()).filter(Boolean)
          : []
        if (!mainTopic) return null
        return {
          dayNumber: dayNumber > 0 ? dayNumber : idx + 1,
          mainTopic,
          tasks: tasksArray,
        }
      })
      .filter(Boolean) as { dayNumber: number; mainTopic: string; tasks: string[] }[]

    if (days.length === 0) {
      return NextResponse.json(
        { error: 'Study plan did not contain valid daily topics' },
        { status: 500 }
      )
    }

    const { data: plan, error: insertError } = await admin
      .from('student_study_plans')
      .insert({
        student_id: user.id,
        course_id: courseId,
        topic,
        total_days: totalDays,
        hours_per_day: hoursPerDay,
        model: MODEL_NAME,
      })
      .select('id, created_at')
      .single()

    if (insertError || !plan) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to save study plan' },
        { status: 500 }
      )
    }

    const { error: itemsError } = await admin.from('student_study_plan_items').insert(
      days.map((d) => ({
        plan_id: plan.id,
        day_number: d.dayNumber,
        main_topic: d.mainTopic,
        tasks: d.tasks,
      }))
    )

    if (itemsError) {
      return NextResponse.json(
        { error: itemsError.message || 'Failed to save study plan items' },
        { status: 500 }
      )
    }

    return await GET(request)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      itemId?: string
      isCompleted?: boolean
    }

    if (!body.itemId || typeof body.isCompleted !== 'boolean') {
      return NextResponse.json(
        { error: 'itemId and isCompleted are required' },
        { status: 400 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { data: item, error: fetchError } = await admin
      .from('student_study_plan_items')
      .select(
        `
        id,
        plan:student_study_plans (
          id,
          student_id
        )
      `
      )
      .eq('id', body.itemId)
      .single()

    if (fetchError || !item) {
      return NextResponse.json(
        { error: fetchError?.message || 'Study plan item not found' },
        { status: 404 }
      )
    }

    if (!item.plan || (item.plan as any).student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: updateError } = await admin
      .from('student_study_plan_items')
      .update({
        is_completed: body.isCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.itemId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update item' },
        { status: 500 }
      )
    }

    return await GET(request)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

function safeParseJson(raw: string): any {
  let text = raw.trim()

  // Strip Markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim()
  }

  try {
    return JSON.parse(text)
  } catch {
    // Fallback: try to extract the first JSON object in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw new Error('Invalid JSON from model')
  }
}

function buildStudyPlanPrompt(input: {
  courseName: string
  topic: string
  totalDays: number
  hoursPerDay: number
}) {
  const { courseName, topic, totalDays, hoursPerDay } = input

  return [
    'Create a concise study plan as STRICT JSON for a university student.',
    'The student is studying the following:',
    `- Course: ${courseName || 'N/A'}`,
    `- Topic or unit: ${topic}`,
    `- Number of days available: ${totalDays}`,
    `- Hours available per day: ${hoursPerDay}`,
    '',
    'Requirements:',
    `- Split the plan into exactly ${totalDays} days.`,
    '- For each day, include:',
    '  - A single main topic for the day (string, 1–2 short sentences max).',
    '  - A short list (2–5 items) of the key things the student must complete that day to cover that main topic (only reading, watching, practice tasks, or revision).',
    '- Do NOT include quizzes, tests, exams, or meta-notes (no \"take a quiz\", \"test yourself\", \"final exam\" etc).',
    '- Do NOT mention specific chapters, sections, page numbers, or named resources (no "Chapter 5", "Section 3.2", or textbook/video titles). Instead, describe what to study in general terms (e.g., "read about inheritance in C++" or "practice polymorphism examples").',
    '- Keep everything practical and focused on learning the material.',
    '',
    'Return ONLY valid JSON in this exact shape:',
    '{',
    '  "days": [',
    '    {',
    '      "dayNumber": 1,',
    '      "mainTopic": "string, main topic of the day",',
    '      "tasks": [',
    '        "string task 1 describing what to study/do",',
    '        "string task 2",',
    '        "... more tasks"',
    '      ]',
    '    }',
    '    // one object per day, up to the total number of days',
    '  ]',
    '}',
  ].join('\n')
}


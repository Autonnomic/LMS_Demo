import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'

const MODEL_NAME = process.env.GROQ_MODEL_NAME || 'llama-3.1-8b-instant'
const DAILY_QUESTION_LIMIT = 100

const groqClient: Groq | null =
  process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null

type RouteMode = 'simple' | 'rag'

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AssistantBody {
  question: string
  history?: HistoryMessage[]
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as AssistantBody
    const question = body?.question?.trim()
    const history = Array.isArray(body?.history) ? body.history : []

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
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

    const today = new Date().toISOString().slice(0, 10)

    const { data: existingUsage } = await admin
      .from('ai_usage')
      .select('id, question_count, prompt_tokens, completion_tokens, total_tokens')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle()

    const currentCount = existingUsage?.question_count ?? 0
    if (currentCount >= DAILY_QUESTION_LIMIT) {
      return NextResponse.json(
        {
          error: 'Daily question limit reached.',
          usage: {
            dailyLimit: DAILY_QUESTION_LIMIT,
            questionsUsed: currentCount,
          },
        },
        { status: 429 }
      )
    }

    const newQuestionCount = currentCount + 1

    const mode = await routeQuestion(question, groqClient)

    let answer: string
    let promptTokensAdded = 0
    let completionTokensAdded = 0
    let totalTokensAdded = 0

    if (mode === 'rag') {
      answer = 'Rag is still under construction'
    } else {
      const result = await answerSimple(question, history, groqClient)
      answer = result.answer
      promptTokensAdded = result.promptTokens
      completionTokensAdded = result.completionTokens
      totalTokensAdded = result.totalTokens
    }

    if (existingUsage) {
      await admin
        .from('ai_usage')
        .update({
          question_count: newQuestionCount,
          prompt_tokens: (existingUsage.prompt_tokens ?? 0) + promptTokensAdded,
          completion_tokens: (existingUsage.completion_tokens ?? 0) + completionTokensAdded,
          total_tokens: (existingUsage.total_tokens ?? 0) + totalTokensAdded,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUsage.id)
    } else {
      await admin.from('ai_usage').insert({
        user_id: user.id,
        usage_date: today,
        question_count: newQuestionCount,
        prompt_tokens: promptTokensAdded,
        completion_tokens: completionTokensAdded,
        total_tokens: totalTokensAdded,
      })
    }

    return NextResponse.json({
      mode,
      answer,
      usage: {
        dailyLimit: DAILY_QUESTION_LIMIT,
        questionsUsed: newQuestionCount,
      },
    })
  } catch (e) {
    console.error('Assistant error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

async function routeQuestion(question: string, client: Groq): Promise<RouteMode> {
  const lower = question.toLowerCase().trim()

  // Strong signals: user explicitly wants answer from course materials → RAG
  const ragPhrases = [
    'course material',
    'course materials',
    'find it on the course',
    'find it in the course',
    'find it out on the course',
    'from my course',
    'from the course',
    'from course',
    'based on the lecture',
    'based on the syllabus',
    'based on my course',
    'based on course material',
    'in my course',
    'in the lecture',
    'in the syllabus',
    'from the lecture',
    'from the syllabus',
    'from my lecture',
    'from my syllabus',
    'what did we cover',
    'what we covered',
    'in our course',
    'from our lecture',
    'my professor said',
    'from the slides',
    'from my notes',
    'from the reading',
    'from the textbook',
    'according to the course',
    'according to my course',
  ]
  if (ragPhrases.some((p) => lower.includes(p))) return 'rag'

  if (question.length < 30) return 'simple'

  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content: [
          'You are a router. Classify the question into one of two modes.',
          'Respond with ONLY a JSON object: { "mode": "simple" } or { "mode": "rag" }.',
          '- Use "simple" for: general study or teaching tips, explaining a concept with a generic example, definitions, how-to questions that do NOT ask for this user\'s specific courses, assignments, schedule, or course materials.',
          '- Use "rag" for: anything that needs this user\'s own data — e.g. "what do I have due", "help me with my assignment", "based on my study plan", "what did we cover in my course", "from my syllabus", "my course materials", "find it in/on the course materials", "explain using my course content", "based on the lecture/slides/readings".',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Question: """${question}"""`,
      },
    ],
    temperature: 0.1,
    max_tokens: 64,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  try {
    const parsed = JSON.parse(raw.replace(/^[^{]*/, '').replace(/[^}]*$/, '')) as { mode?: RouteMode }
    return parsed.mode === 'rag' ? 'rag' : 'simple'
  } catch {
    return 'simple'
  }
}

async function answerSimple(
  question: string,
  history: HistoryMessage[],
  client: Groq
): Promise<{
  answer: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}> {
  const limitedHistory = history.slice(-6)

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a university AI helper. Answer clearly and briefly, using simple language and at most 3–4 short paragraphs. When the user says they did not understand, re-explain the earlier idea more simply with concrete, step-by-step examples instead of asking them what they do not understand. Do not restate long questions in full.',
    },
    ...limitedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: question,
    },
  ]

  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages,
    temperature: 0.3,
    max_tokens: 512,
  })

  const usage = completion.usage

  return {
    answer: completion.choices[0]?.message?.content?.trim() ?? '',
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  }
}

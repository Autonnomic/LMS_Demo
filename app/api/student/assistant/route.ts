import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { getAuthUser } from '@/lib/supabase/server'

const MODEL_NAME = process.env.GROQ_MODEL_NAME || 'llama-3.1-8b-instant'

const groqClient =
  process.env.GROQ_API_KEY &&
  new Groq({ apiKey: process.env.GROQ_API_KEY })

type RouteMode = 'simple' | 'rag'

interface AssistantBody {
  question: string
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as AssistantBody
    const question = body?.question?.trim()

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

    const mode = await routeQuestion(question)

    if (mode === 'rag') {
      return NextResponse.json({
        mode: 'rag',
        answer: 'Rag is still under construction',
      })
    }

    const answer = await answerSimple(question)
    return NextResponse.json({ mode: 'simple', answer })
  } catch (e) {
    console.error('Student assistant error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

async function routeQuestion(question: string): Promise<RouteMode> {
  if (question.length < 30) return 'simple'

  const completion = await groqClient!.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content: [
          'You are a router. Classify the student question into one of two modes.',
          'Respond with ONLY a JSON object: { "mode": "simple" } or { "mode": "rag" }.',
          '- Use "simple" for: general study tips, explaining a concept, definitions, how-to questions that do NOT need this student\'s specific courses, assignments, schedule, or materials.',
          '- Use "rag" for: anything that clearly needs this student\'s own data — e.g. "what do I have due", "help me with my CS101 assignment", "based on my study plan", "what did we cover in my course", "my professor said", "from my notes/syllabus".',
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

async function answerSimple(question: string): Promise<string> {
  const completion = await groqClient!.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content:
          'You are a friendly university study assistant. Answer clearly and concisely for a student. Use short step-by-step reasoning when it helps.',
      },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  })

  return completion.choices[0]?.message?.content?.trim() ?? ''
}

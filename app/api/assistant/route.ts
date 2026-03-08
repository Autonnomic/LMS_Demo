import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { getOllamaEmbedding } from '@/lib/ollama-embed'

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
  courseId?: string
}

function isEducationalQuestion(question: string): boolean {
  const lower = question.toLowerCase()

  // Strong positive signals that this is about education / learning
  const educationalKeywords = [
    'exam',
    'exams',
    'test',
    'quiz',
    'assignment',
    'homework',
    'hw',
    'course',
    'class',
    'lecture',
    'syllabus',
    'curriculum',
    'semester',
    'module',
    'chapter',
    'topic',
    'lesson',
    'practice question',
    'practice questions',
    'mcq',
    'multiple choice',
    'university',
    'college',
    'school',
    'teacher',
    'professor',
    'tutor',
    'study',
    'studying',
    'revision',
    'revise',
    'learn',
    'learning',
    'concept',
    'explain',
    'definition',
    'derivation',
    'formula',
    'theorem',
    'proof',
    'exercise',
    'problem',
    'solve',
    'solution',
  ]
  if (educationalKeywords.some((k) => lower.includes(k))) return true

  // Clear non‑educational intents: jokes, entertainment, chit‑chat, etc.
  const nonEducationalKeywords = [
    'joke',
    'jokes',
    'meme',
    'memes',
    'story',
    'stories',
    'song',
    'songs',
    'lyrics',
    'poem',
    'poems',
    'rap',
    'facebook',
    'instagram',
    'tiktok',
    'twitter',
    'x.com',
    'netflix',
    'prime video',
    'movie',
    'movies',
    'series',
    'tv show',
    'tv shows',
    'celebrity',
    'celebrities',
    'gossip',
    'politics',
    'election',
    'elections',
    'trump',
    'biden',
    'modi',
    'bjp',
    'congress',
    'dating',
    'relationship',
    'relationships',
    'girlfriend',
    'boyfriend',
    'crush',
    'marriage',
    'divorce',
    'astrology',
    'horoscope',
    'zodiac',
    'lottery',
    'betting',
    'casino',
    'gambling',
    'stock market',
    'crypto',
    'bitcoin',
    'ether',
    'ethereum',
    'dogecoin',
    'weather',
    'forecast',
    'recipe',
    'cook',
    'cooking',
    'travel',
    'vacation',
    'holiday',
  ]
  if (nonEducationalKeywords.some((k) => lower.includes(k))) return false

  // Short friendly messages without any obvious educational language → treat as non‑educational.
  const collapsed = lower.replace(/[\s!?.]+/g, ' ').trim()
  const shortSmallTalk = [
    'hi',
    'hello',
    'hey',
    'yo',
    'whats up',
    'what\'s up',
    'how are you',
    'how r u',
    'sup',
    'good morning',
    'good night',
    'good evening',
    'good afternoon',
  ]
  if (shortSmallTalk.includes(collapsed)) return false

  // Default: be permissive and treat as educational so that genuine learning
  // questions that don't match the above keywords are still answered.
  return true
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
    const preferredCourseId = body?.courseId ?? undefined

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

    // Enforce "education‑only" behavior. Non‑educational questions are rejected
    // early and do NOT count against the daily AI usage limit.
    if (!isEducationalQuestion(question)) {
      return NextResponse.json({
        mode: 'simple' as RouteMode,
        answer: 'Please ask education related questions only',
      })
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
      const ragResult = await answerWithRag(question, history, preferredCourseId, user.id, admin, request, groqClient)
      answer = ragResult.answer
      promptTokensAdded = ragResult.promptTokens
      completionTokensAdded = ragResult.completionTokens
      totalTokensAdded = ragResult.totalTokens
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
  if (/from\s+.+course/.test(lower) || /\b(in|from)\s+(my\s+)?(the\s+)?(.+\s+)?course\b/.test(lower)) return 'rag'
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
        [
          'You are a university AI helper.',
          'You must only answer questions that are related to education, learning, courses, exams, academic subjects, or skill/knowledge development.',
          'If the user asks about anything non-educational (for example: jokes, entertainment, personal life advice, relationships, politics, news, gossip, social media, travel, recipes, etc.), reply EXACTLY with this sentence and nothing else:',
          '"Please ask education related questions only"',
          '',
          'For valid educational questions, answer clearly and briefly using simple language and at most 3–4 short paragraphs.',
          'When the user says they did not understand, re-explain the earlier idea more simply with concrete, step-by-step examples instead of asking them what they do not understand.',
          'Do not restate long questions in full.',
        ].join(' '),
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

/** RAG: resolve course, fetch relevant chunks, answer with Groq using that context. */
async function answerWithRag(
  question: string,
  history: HistoryMessage[],
  preferredCourseId: string | undefined,
  userId: string,
  admin: SupabaseClient,
  request: Request,
  groqClient: Groq
): Promise<{
  answer: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}> {
  const { data: profile } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const isProfessor = profile?.role === 'professor'
  let courses: { id: string; name: string; code: string }[] = []

  if (isProfessor) {
    const { data: taughtByPrimary } = await admin
      .from('courses')
      .select('id, name, code')
      .eq('professor_id', userId)
    const { data: taughtBySecondary } = await admin
      .from('course_professors')
      .select('course_id')
      .eq('professor_id', userId)
    const primaryCourses = (taughtByPrimary ?? []).map((c) => ({
      id: c.id,
      name: (c.name ?? '').trim(),
      code: (c.code ?? '').trim(),
    }))
    const secondaryIds = (taughtBySecondary ?? []).map((r) => r.course_id).filter(Boolean)
    let secondaryCourses: { id: string; name: string; code: string }[] = []
    if (secondaryIds.length > 0) {
      const { data: secondaryRows } = await admin
        .from('courses')
        .select('id, name, code')
        .in('id', secondaryIds)
      secondaryCourses = (secondaryRows ?? []).map((c) => ({
        id: c.id,
        name: (c.name ?? '').trim(),
        code: (c.code ?? '').trim(),
      }))
    }
    const seen = new Set<string>()
    for (const c of [...primaryCourses, ...secondaryCourses]) {
      if (!seen.has(c.id)) {
        seen.add(c.id)
        courses.push(c)
      }
    }
  }

  if (courses.length === 0) {
    const { data: enrollments } = await admin
      .from('course_registrations')
      .select('course_id, course:courses(id, name, code)')
      .eq('student_id', userId)
      .eq('status', 'enrolled')

    courses = (enrollments ?? []).map((e: { course_id: string; course: { id: string; name: string; code: string }[] | null }) => {
      const course = Array.isArray(e.course) ? e.course[0] ?? null : e.course
      return course ? { id: course.id, name: course.name ?? '', code: course.code ?? '' } : null
    }).filter(Boolean) as { id: string; name: string; code: string }[]
  }

  if (courses.length === 0) {
    return {
      answer: "You don't have access to any course materials (enrolled or teaching), so I can't search them. Ask a general question for a direct answer.",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }

  let courseId = preferredCourseId && courses.some((c) => c.id === preferredCourseId) ? preferredCourseId : undefined
  if (!courseId) {
    const lower = question.toLowerCase()
    const match = courses.find(
      (c) =>
        lower.includes(c.name.toLowerCase()) ||
        lower.includes(c.code.toLowerCase()) ||
        c.name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && lower.includes(w))
    )
    courseId = match?.id ?? courses[0].id
  }

  let chunks: { content: string; main_keyword?: string }[]
  try {
    const queryEmbedding = await getOllamaEmbedding(question)
    const { data, error } = await admin.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      p_course_id: courseId,
      match_limit: 12,
    } as never)
    if (error) throw new Error(error.message)
    chunks = Array.isArray(data) ? data : []
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Search failed'
    return {
      answer: `I couldn't search course materials (${msg}). Try asking without referring to a specific course for a direct answer.`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }

  if (!chunks.length) {
    return {
      answer: "I couldn't find relevant material in your course for that question. Make sure materials are indexed for search, or try rephrasing.",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }

  const context = chunks.map((c, i) => `[${i + 1}] ${(c.content ?? '').trim()}`).join('\n\n')
  const systemContent = [
    'You are a university AI helper. Your answer MUST be grounded in the following excerpts from the course materials.',
    'Rules:',
    '- Use the exact terminology, examples, and code from the excerpts. Do not replace them with generic explanations.',
    '- Preserve precise meaning: do not mix distinct concepts (e.g. reading from a file vs writing/saving to a file; serializing vs deserializing). If the excerpt says read() returns strings when you read from a file, say that—do not say "when you want to save" for something that refers to reading.',
    '- If the excerpts show code (e.g. json.dumps, json.load), function names, or definitions, include or paraphrase those in your answer.',
    '- Prefer quoting or closely paraphrasing the material. Only add brief clarification if needed.',
    '- If the excerpts do not contain enough information, say so first, then add a short general note.',
    '- Do not invent content that is not in the excerpts. Keep the answer to 3–4 short paragraphs.',
    '',
    'Excerpts from course materials:',
    context,
  ].join('\n')

  const limitedHistory = history.slice(-4)
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...limitedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ]

  const completion = await groqClient.chat.completions.create({
    model: MODEL_NAME,
    messages,
    temperature: 0.2,
    max_tokens: 600,
  })
  const usage = (completion.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

  return {
    answer: completion.choices[0]?.message?.content?.trim() ?? '',
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  }
}

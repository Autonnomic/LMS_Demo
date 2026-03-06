import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/supabase/server'
import { getOllamaEmbedding } from '@/lib/ollama-embed'

/**
 * POST { query: string, courseId: string, limit?: number }
 * Returns similar chunks ordered by cosine similarity (fast via HNSW index).
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const query = body.query?.trim()
    const courseId = body.courseId ?? body.course_id
    const limit = Math.min(Number(body.limit) || 5, 20)

    if (!query || !courseId) {
      return NextResponse.json({ error: 'Missing query or courseId' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single()

    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isProfessor = profile?.role === 'professor'
    const { data: taught } = isProfessor
      ? await supabase.from('courses').select('id').eq('id', courseId).eq('professor_id', user.id).single()
      : { data: null }
    const { data: enrolled } = !isProfessor
      ? await supabase.from('course_registrations').select('course_id').eq('course_id', courseId).eq('student_id', user.id).eq('status', 'enrolled').single()
      : { data: null }

    if (!taught?.id && !enrolled?.course_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const queryEmbedding = await getOllamaEmbedding(query)

    const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      p_course_id: courseId,
      match_limit: limit,
    })

    if (error) {
      if (error.code === '42883') {
        return NextResponse.json({
          error: 'Similarity search not available. Run the SQL migration that creates match_document_chunks().',
        }, { status: 501 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ chunks: chunks ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

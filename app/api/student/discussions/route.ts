import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

// Expected tables (create in Supabase):
// discussion_threads: id uuid pk, student_id uuid fk -> user_profiles.id, college_id bigint fk -> colleges.id,
//   title text, body text, created_at timestamptz default now()
// discussion_replies: id uuid pk, thread_id uuid fk -> discussion_threads.id, student_id uuid fk -> user_profiles.id,
//   body text, created_at timestamptz default now()

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('role, college_id, first_name, last_name')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message || 'Profile not found' },
        { status: 400 }
      )
    }

    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (profile.college_id == null) {
      return NextResponse.json(
        { error: 'Student must belong to a college to use discussions.' },
        { status: 400 }
      )
    }

    const collegeId = Number(profile.college_id)

    const { data, error } = await admin
      .from('discussion_threads')
      .select(`
        id,
        title,
        body,
        created_at,
        author:user_profiles!discussion_threads_student_id_fkey (
          id,
          first_name,
          last_name
        ),
        replies:discussion_replies (
          id,
          body,
          created_at,
          author:user_profiles!discussion_replies_student_id_fkey (
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq('college_id', collegeId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const threads = (data ?? []).map((t: any) => ({
      id: t.id as string,
      title: t.title as string,
      body: t.body as string,
      created_at: t.created_at as string,
      author: {
        id: t.author?.id as string | null,
        first_name: t.author?.first_name as string | null,
        last_name: t.author?.last_name as string | null,
      },
      replies: (Array.isArray(t.replies) ? t.replies : []).sort(
        (a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    }))

    return NextResponse.json({ threads })
  } catch (e) {
    console.error('student/discussions GET error:', e)
    return NextResponse.json(
      { error: 'Server error' },
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

    const admin = createServiceRoleClient()

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message || 'Profile not found' },
        { status: 400 }
      )
    }

    if (profile.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (profile.college_id == null) {
      return NextResponse.json(
        { error: 'Student must belong to a college to use discussions.' },
        { status: 400 }
      )
    }

    const collegeId = Number(profile.college_id)

    const body = await request.json().catch(() => ({}))
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const content = typeof body?.body === 'string' ? body.body.trim() : ''

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and body are required.' },
        { status: 400 }
      )
    }

    const { data: inserted, error } = await admin
      .from('discussion_threads')
      .insert({
        title,
        body: content,
        student_id: user.id,
        college_id: collegeId,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ id: inserted?.id }, { status: 201 })
  } catch (e) {
    console.error('student/discussions POST error:', e)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}


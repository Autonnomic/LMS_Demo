import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

interface RouteParams {
  params: { threadId: string }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const threadId = params.threadId
    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 })
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

    // Ensure the thread exists and belongs to the same college
    const { data: thread, error: threadError } = await admin
      .from('discussion_threads')
      .select('id, college_id')
      .eq('id', threadId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json(
        { error: threadError?.message || 'Thread not found' },
        { status: 404 }
      )
    }

    if (Number(thread.college_id) !== collegeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const content = typeof body?.body === 'string' ? body.body.trim() : ''

    if (!content) {
      return NextResponse.json(
        { error: 'Reply body is required.' },
        { status: 400 }
      )
    }

    const { data: inserted, error } = await admin
      .from('discussion_replies')
      .insert({
        thread_id: threadId,
        student_id: user.id,
        body: content,
      })
      .select('id, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { id: inserted?.id, created_at: inserted?.created_at },
      { status: 201 }
    )
  } catch (e) {
    console.error('student/discussions/[threadId]/replies POST error:', e)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}


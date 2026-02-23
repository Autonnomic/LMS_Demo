import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can request enrollment' }, { status: 403 })
    }

    const body = await request.json()
    const { courseId } = body as { courseId?: string }
    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid body: courseId required' },
        { status: 400 }
      )
    }

    // Check if already enrolled or has pending request
    const { data: existing } = await supabase
      .from('course_registrations')
      .select('id, status')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .single()

    if (existing) {
      if (existing.status === 'enrolled') {
        return NextResponse.json(
          { error: 'Already enrolled in this course' },
          { status: 400 }
        )
      }
      if (existing.status === 'pending') {
        return NextResponse.json(
          { error: 'Enrollment request already pending' },
          { status: 400 }
        )
      }
    }

    // Create enrollment request
    const { error: insertError } = await supabase
      .from('course_registrations')
      .insert({
        student_id: user.id,
        course_id: courseId,
        status: 'pending'
      })

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

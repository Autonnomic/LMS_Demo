import { createClient } from '@supabase/supabase-js'
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

    const { data: myProfile } = await supabase
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()

    if (myProfile?.role !== 'admin' || myProfile?.college_id == null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const adminCollegeId = Number(myProfile.college_id)

    const body = await request.json()
    const { registrationId, action } = body as { registrationId?: string; action?: 'accept' | 'reject' }
    if (!registrationId || !action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid body: registrationId and action (accept|reject) required' },
        { status: 400 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    if (action === 'accept') {
      // When accepting, default professor_id to the primary professor for the course (if any)
      const { data: registration } = await adminClient
        .from('course_registrations')
        .select('id, course_id, professor_id')
        .eq('id', registrationId)
        .single()

      if (!registration) {
        return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
      }
      const { data: course } = await adminClient
        .from('courses')
        .select('college_id')
        .eq('id', registration.course_id)
        .single()
      if (!course || Number(course.college_id) !== adminCollegeId) {
        return NextResponse.json({ error: 'Forbidden: course not in your college' }, { status: 403 })
      }

      let professorId = registration.professor_id as string | null
      if (!professorId) {
        const { data: course } = await adminClient
          .from('courses')
          .select('professor_id')
          .eq('id', registration.course_id)
          .single()
        professorId = course?.professor_id ?? null
      }

      const { error: updateError } = await adminClient
        .from('course_registrations')
        .update({ status: 'enrolled', professor_id: professorId })
        .eq('id', registrationId)

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        )
      }
    } else {
      // Reject: verify course belongs to admin's college, then delete the registration
      const { data: reg } = await adminClient
        .from('course_registrations')
        .select('course_id')
        .eq('id', registrationId)
        .single()
      if (reg) {
        const { data: course } = await adminClient
          .from('courses')
          .select('college_id')
          .eq('id', reg.course_id)
          .single()
        if (!course || Number(course.college_id) !== adminCollegeId) {
          return NextResponse.json({ error: 'Forbidden: course not in your college' }, { status: 403 })
        }
      }
      const { error: deleteError } = await adminClient
        .from('course_registrations')
        .delete()
        .eq('id', registrationId)

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

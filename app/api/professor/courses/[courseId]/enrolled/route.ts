import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    }

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'professor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: course } = await admin
      .from('courses')
      .select('id, professor_id')
      .eq('id', courseId)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isPrimaryProfessor = course.professor_id === user.id
    let isCourseProfessor = isPrimaryProfessor
    if (!isCourseProfessor) {
      const { data: cp } = await admin
        .from('course_professors')
        .select('professor_id')
        .eq('course_id', courseId)
        .eq('professor_id', user.id)
        .maybeSingle()
      isCourseProfessor = !!cp
    }

    if (!isCourseProfessor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: regs, error: regError } = await admin
      .from('course_registrations')
      .select('id, student_id, registered_at')
      .eq('course_id', courseId)
      .eq('status', 'enrolled')
      .order('registered_at', { ascending: false })

    if (regError) {
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    if (!regs?.length) {
      return NextResponse.json({ enrolled: [] })
    }

    const studentIds = [...new Set(regs.map((r) => r.student_id))]
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .in('id', studentIds)

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

    const enrolled = regs.map((reg) => {
      const p = profileMap.get(reg.student_id)
      return {
        id: p?.id ?? reg.student_id,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        email: p?.email ?? null,
        registration_id: reg.id,
        registered_at: reg.registered_at,
      }
    })

    return NextResponse.json({ enrolled })
  } catch (e) {
    console.error('Enrolled students API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

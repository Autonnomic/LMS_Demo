import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/professor/courses/[courseId]
 * Returns the course if the current user is a professor with access
 * (primary professor or listed in course_professors, same college).
 * Uses service role so RLS does not block access for secondary professors.
 */
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

    const admin = createServiceRoleClient()

    const { data: myProfile, error: profileError } = await admin
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()

    if (profileError || !myProfile) {
      return NextResponse.json(
        { error: profileError?.message || 'Profile not found' },
        { status: 400 }
      )
    }

    if (myProfile.role !== 'professor' || myProfile.college_id == null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const collegeId = Number(myProfile.college_id)

    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('id, code, name, description, credits, semester, academic_year, professor_id, college_id')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    if (Number(course.college_id) !== collegeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isPrimaryProfessor = course.professor_id === user.id
    let hasAccess = isPrimaryProfessor
    if (!hasAccess) {
      const { data: cp } = await admin
        .from('course_professors')
        .select('professor_id')
        .eq('course_id', courseId)
        .eq('professor_id', user.id)
        .maybeSingle()
      hasAccess = !!cp
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { professor_id, college_id, ...safeCourse } = course
    return NextResponse.json(safeCourse)
  } catch (e) {
    console.error('professor/courses/[courseId] GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

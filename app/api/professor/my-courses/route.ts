import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
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

    // Courses where this professor is the primary professor
    const { data: primaryCourses, error: primaryError } = await admin
      .from('courses')
      .select('id')
      .eq('professor_id', user.id)
      .eq('college_id', collegeId)

    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 400 })
    }

    // Courses where this professor is listed in course_professors
    const { data: cpRows, error: cpError } = await admin
      .from('course_professors')
      .select('course_id')
      .eq('professor_id', user.id)

    if (cpError) {
      return NextResponse.json({ error: cpError.message }, { status: 400 })
    }

    const idSet = new Set<string>()
    ;(primaryCourses || []).forEach((c: { id: string | null }) => {
      if (c.id) idSet.add(c.id)
    })

    const secondaryCourseIds = (cpRows || [])
      .map((row: { course_id: string | null }) => row.course_id)
      .filter((id): id is string => !!id)

    if (secondaryCourseIds.length > 0) {
      const { data: secondaryCourses, error: secondaryError } = await admin
        .from('courses')
        .select('id')
        .in('id', secondaryCourseIds)
        .eq('college_id', collegeId)

      if (secondaryError) {
        return NextResponse.json({ error: secondaryError.message }, { status: 400 })
      }

      ;(secondaryCourses || []).forEach((c: { id: string | null }) => {
        if (c.id) idSet.add(c.id)
      })
    }

    const courseIds = Array.from(idSet)
    if (!courseIds.length) {
      return NextResponse.json({ courses: [] })
    }

    const { data: courses, error: coursesError } = await admin
      .from('courses')
      .select('id, code, name, description, credits, semester, academic_year')
      .in('id', courseIds)
      .eq('college_id', collegeId)
      .order('code', { ascending: true })

    if (coursesError) {
      return NextResponse.json({ error: coursesError.message }, { status: 400 })
    }

    return NextResponse.json({ courses: courses ?? [] })
  } catch (e) {
    console.error('professor/my-courses error:', e)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}


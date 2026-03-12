import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

async function assertProfessorCourseAccess(courseId: string, request: Request) {
  const user = await getAuthUser(request)
  if (!user) throw { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createServiceRoleClient()
  const { data: profile } = await admin.from('user_profiles').select('role, college_id').eq('id', user.id).single()
  if (profile?.role !== 'professor' || profile?.college_id == null) {
    throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const { data: course } = await admin.from('courses').select('id, professor_id, college_id').eq('id', courseId).single()
  if (!course || Number(course.college_id) !== Number(profile.college_id)) {
    throw { response: NextResponse.json({ error: 'Course not found' }, { status: 404 }) }
  }
  const isPrimary = course.professor_id === user.id
  let hasAccess = isPrimary
  if (!hasAccess) {
    const { data: cp } = await admin.from('course_professors').select('professor_id').eq('course_id', courseId).eq('professor_id', user.id).maybeSingle()
    hasAccess = !!cp
  }
  if (!hasAccess) throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { admin, courseId }
}

/**
 * PATCH /api/professor/courses/[courseId]/enrolled/assign-section
 * Body: { registrationId?: string, registrationIds?: string[], sectionId: string | null }
 * - sectionId null = unassign from section.
 * - Either registrationId (single) or registrationIds (array) must be provided.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)
    const body = await request.json().catch(() => ({}))
    const { registrationId, registrationIds, sectionId } = body as {
      registrationId?: string
      registrationIds?: string[]
      sectionId?: string | null
    }
    let ids: string[] = []
    if (typeof registrationId === 'string' && registrationId) ids = [registrationId]
    else if (Array.isArray(registrationIds)) ids = registrationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Provide registrationId or registrationIds' }, { status: 400 })
    }
    if (sectionId !== null && sectionId !== undefined) {
      const { data: section } = await admin.from('course_sections').select('id').eq('id', sectionId).eq('course_id', courseId).single()
      if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    const updatePayload = { section_id: sectionId === null || sectionId === undefined ? null : sectionId }
    const { error } = await admin
      .from('course_registrations')
      .update(updatePayload)
      .eq('course_id', courseId)
      .in('id', ids)
      .eq('status', 'enrolled')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, updated: ids.length })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('assign-section PATCH error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

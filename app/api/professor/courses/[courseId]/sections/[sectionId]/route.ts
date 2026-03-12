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

/** PATCH /api/professor/courses/[courseId]/sections/[sectionId] — update section */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; sectionId: string }> }
) {
  try {
    const { courseId, sectionId } = await params
    if (!courseId || !sectionId) return NextResponse.json({ error: 'Missing courseId or sectionId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)
    const body = await request.json().catch(() => ({}))
    const updates: { name?: string; description?: string; sort_order?: number } = {}
    if (typeof body.name === 'string' && body.name.trim() !== '') updates.name = body.name.trim()
    if (body.description !== undefined) updates.description = body.description === null || body.description === '' ? null : String(body.description).trim()
    if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
    if (Object.keys(updates).length === 0) {
      const { data: section } = await admin.from('course_sections').select('id, course_id, name, description, sort_order, created_at').eq('id', sectionId).eq('course_id', courseId).single()
      if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
      return NextResponse.json(section)
    }
    const { data: section, error } = await admin
      .from('course_sections')
      .update(updates)
      .eq('id', sectionId)
      .eq('course_id', courseId)
      .select('id, course_id, name, description, sort_order, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    return NextResponse.json(section)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('sections PATCH error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/professor/courses/[courseId]/sections/[sectionId] — delete section (unenrolled students stay; section_id set to null) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string; sectionId: string }> }
) {
  try {
    const { courseId, sectionId } = await params
    if (!courseId || !sectionId) return NextResponse.json({ error: 'Missing courseId or sectionId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)
    const { error } = await admin.from('course_sections').delete().eq('id', sectionId).eq('course_id', courseId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('sections DELETE error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

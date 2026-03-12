import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

/** Assert current user is a professor with access to this course. Returns admin client and courseId or throws response. */
async function assertProfessorCourseAccess(courseId: string, request: Request) {
  const user = await getAuthUser(request)
  if (!user) {
    throw { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
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
  if (!hasAccess) {
    throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { admin, courseId }
}

/** GET /api/professor/courses/[courseId]/sections — list sections for the course */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)
    const { data: sections, error } = await admin
      .from('course_sections')
      .select('id, course_id, name, description, sort_order, created_at')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sections: sections ?? [] })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('sections GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/professor/courses/[courseId]/sections — create a section */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)
    const body = await request.json().catch(() => ({}))
    const { name, description, sort_order } = body as { name?: string; description?: string; sort_order?: number }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const { data: section, error } = await admin
      .from('course_sections')
      .insert({
        course_id: courseId,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        sort_order: typeof sort_order === 'number' ? sort_order : 0,
      })
      .select('id, course_id, name, description, sort_order, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(section)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('sections POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

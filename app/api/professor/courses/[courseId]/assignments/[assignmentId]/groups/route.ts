import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

async function assertProfessorCourse(courseId: string, request: Request) {
  const user = await getAuthUser(request)
  if (!user) throw { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createServiceRoleClient()
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'professor') throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: course } = await admin.from('courses').select('id, professor_id').eq('id', courseId).single()
  if (!course) throw { response: NextResponse.json({ error: 'Course not found' }, { status: 404 }) }
  let hasAccess = course.professor_id === user.id
  if (!hasAccess) {
    const { data: cp } = await admin.from('course_professors').select('professor_id').eq('course_id', courseId).eq('professor_id', user.id).maybeSingle()
    hasAccess = !!cp
  }
  if (!hasAccess) throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { admin, courseId }
}

/** GET /api/professor/courses/[courseId]/assignments/[assignmentId]/groups */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> }
) {
  try {
    const { courseId, assignmentId } = await params
    if (!courseId || !assignmentId) {
      return NextResponse.json({ error: 'Missing courseId or assignmentId' }, { status: 400 })
    }
    const { admin } = await assertProfessorCourse(courseId, request)

    const { data: assignment } = await admin
      .from('assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('course_id', courseId)
      .single()
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

    const { data: groups, error: gErr } = await admin
      .from('assignment_groups')
      .select('id, name, sort_order')
      .eq('assignment_id', assignmentId)
      .order('sort_order', { ascending: true })
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

    if (!groups?.length) return NextResponse.json({ groups: [] })

    const { data: members, error: mErr } = await admin
      .from('assignment_group_members')
      .select('assignment_group_id, student_id')
      .in('assignment_group_id', groups.map((g: { id: string }) => g.id))
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

    const membersByGroup = (members ?? []).reduce((acc: Record<string, string[]>, row: { assignment_group_id: string; student_id: string }) => {
      if (!acc[row.assignment_group_id]) acc[row.assignment_group_id] = []
      acc[row.assignment_group_id].push(row.student_id)
      return acc
    }, {})

    const studentIds = Array.from(
      new Set((members ?? []).map((m: { student_id: string }) => m.student_id))
    )
    const { data: profiles } = studentIds.length
      ? await admin.from('user_profiles').select('id, first_name, last_name, email').in('id', studentIds)
      : { data: [] }
    const profileMap = (profiles ?? []).reduce((acc: Record<string, { first_name: string | null; last_name: string | null; email: string | null }>, p: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => {
      acc[p.id] = { first_name: p.first_name, last_name: p.last_name, email: p.email }
      return acc
    }, {})

    const result = groups.map((g: { id: string; name: string; sort_order: number }) => ({
      id: g.id,
      name: g.name,
      sort_order: g.sort_order,
      students: (membersByGroup[g.id] ?? []).map((sid: string) => ({
        id: sid,
        ...profileMap[sid],
      })),
    }))
    return NextResponse.json({ groups: result })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('groups GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

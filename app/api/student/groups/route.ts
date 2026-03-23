import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/student/groups
 * Returns groups the current student belongs to (for sidebar).
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createServiceRoleClient()

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // My group memberships -> group -> assignment -> course
    const { data: memberships, error: mErr } = await admin
      .from('assignment_group_members')
      .select('assignment_group_id')
      .eq('student_id', user.id)
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
    if (!memberships?.length) return NextResponse.json({ groups: [] })

    const groupIds = memberships.map((m: { assignment_group_id: string }) => m.assignment_group_id)
    const { data: groups, error: gErr } = await admin
      .from('assignment_groups')
      .select('id, name, assignment_id')
      .in('id', groupIds)
    if (gErr || !groups?.length) return NextResponse.json({ groups: groups ?? [] })

    const assignmentIds = Array.from(new Set(groups.map((g: { assignment_id: string }) => g.assignment_id)))
    const { data: assignments } = await admin
      .from('assignments')
      .select('id, title, course_id')
      .in('id', assignmentIds)
    const courseIds = Array.from(
      new Set((assignments ?? []).map((a: { course_id: string }) => a.course_id))
    )
    const { data: courses } = await admin.from('courses').select('id, name, code').in('id', courseIds)

    const courseMap = (courses ?? []).reduce((acc: Record<string, { name: string; code: string }>, c: { id: string; name: string; code: string }) => {
      acc[c.id] = { name: c.name, code: c.code }
      return acc
    }, {})
    const assignmentMap = (assignments ?? []).reduce((acc: Record<string, { title: string; course_id: string }>, a: { id: string; title: string; course_id: string }) => {
      acc[a.id] = { title: a.title, course_id: a.course_id }
      return acc
    }, {})

    const result = groups.map((g: { id: string; name: string; assignment_id: string }) => {
      const a = assignmentMap[g.assignment_id]
      const c = a ? courseMap[a.course_id] : null
      return {
        groupId: g.id,
        groupName: g.name,
        assignmentId: g.assignment_id,
        assignmentTitle: a?.title ?? '',
        courseId: a?.course_id ?? null,
        courseName: c?.name ?? '',
        courseCode: c?.code ?? '',
      }
    })
    return NextResponse.json({ groups: result })
  } catch (e) {
    console.error('student groups GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

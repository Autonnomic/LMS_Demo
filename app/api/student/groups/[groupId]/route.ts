import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/student/groups/[groupId]
 * Returns group details and members. Only if current user is in the group.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createServiceRoleClient()

    const { data: membership } = await admin
      .from('assignment_group_members')
      .select('assignment_group_id')
      .eq('assignment_group_id', groupId)
      .eq('student_id', user.id)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: group, error: gErr } = await admin
      .from('assignment_groups')
      .select('id, name, assignment_id')
      .eq('id', groupId)
      .single()
    if (gErr || !group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const { data: assignment } = await admin
      .from('assignments')
      .select('id, title, course_id')
      .eq('id', group.assignment_id)
      .single()
    const { data: course } = assignment
      ? await admin.from('courses').select('id, name, code').eq('id', assignment.course_id).single()
      : { data: null }

    const { data: members } = await admin
      .from('assignment_group_members')
      .select('student_id')
      .eq('assignment_group_id', groupId)
    const studentIds = (members ?? []).map((m: { student_id: string }) => m.student_id)
    const { data: profiles } = studentIds.length
      ? await admin.from('user_profiles').select('id, first_name, last_name, email').in('id', studentIds)
      : { data: [] }

    const students = (profiles ?? []).map((p: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
    }))
    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        assignmentId: group.assignment_id,
        assignmentTitle: assignment?.title ?? '',
        courseId: assignment?.course_id ?? null,
        courseName: course?.name ?? '',
        courseCode: course?.code ?? '',
      },
      members: students,
    })
  } catch (e) {
    console.error('student group GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

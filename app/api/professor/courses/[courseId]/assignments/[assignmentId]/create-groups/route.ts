import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

/** Shuffle array in place (Fisher–Yates) and return. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Assert professor has access to this course. */
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

/**
 * POST /api/professor/courses/[courseId]/assignments/[assignmentId]/create-groups
 * Creates or recreates random groups for a group assignment. Deletes existing groups first.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> }
) {
  try {
    const { courseId, assignmentId } = await params
    if (!courseId || !assignmentId) {
      return NextResponse.json({ error: 'Missing courseId or assignmentId' }, { status: 400 })
    }
    const { admin } = await assertProfessorCourse(courseId, request)

    const { data: assignment, error: assignErr } = await admin
      .from('assignments')
      .select('id, course_id, is_group_assignment, group_size, section_id')
      .eq('id', assignmentId)
      .eq('course_id', courseId)
      .single()

    if (assignErr || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }
    if (!assignment.is_group_assignment || assignment.group_size == null || assignment.group_size < 2) {
      return NextResponse.json(
        { error: 'Assignment must be a group assignment with group size ≥ 2' },
        { status: 400 }
      )
    }

    let regsQuery = admin
      .from('course_registrations')
      .select('student_id')
      .eq('course_id', courseId)
      .eq('status', 'enrolled')
    if (assignment.section_id) {
      regsQuery = regsQuery.eq('section_id', assignment.section_id)
    }
    const { data: regs, error: regError } = await regsQuery
    if (regError) return NextResponse.json({ error: regError.message }, { status: 500 })
    const studentIds = (regs ?? []).map((r: { student_id: string }) => r.student_id).filter(Boolean)
    if (studentIds.length === 0) {
      return NextResponse.json({ error: 'No enrolled students to assign to groups' }, { status: 400 })
    }

    const shuffled = shuffle(studentIds)
    const groupSize = Math.max(2, Math.floor(assignment.group_size))
    const groups: string[][] = []
    for (let i = 0; i < shuffled.length; i += groupSize) {
      groups.push(shuffled.slice(i, i + groupSize))
    }
    if (groups.length === 0) {
      return NextResponse.json({ error: 'Could not form any groups' }, { status: 400 })
    }

    // Delete existing groups for this assignment (cascade deletes members)
    const { error: delError } = await admin.from('assignment_groups').delete().eq('assignment_id', assignmentId)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    // Insert new groups and members
    const groupRows: { assignment_id: string; name: string; sort_order: number }[] = groups.map((_, i) => ({
      assignment_id: assignmentId,
      name: `Group ${i + 1}`,
      sort_order: i,
    }))
    const { data: insertedGroups, error: insertGroupError } = await admin
      .from('assignment_groups')
      .insert(groupRows)
      .select('id, sort_order')
      .order('sort_order', { ascending: true })
    if (insertGroupError) return NextResponse.json({ error: insertGroupError.message }, { status: 500 })
    if (!insertedGroups?.length) return NextResponse.json({ groups: [] })

    const members: { assignment_group_id: string; student_id: string }[] = []
    insertedGroups.forEach((g: { id: string; sort_order: number }, idx: number) => {
      const studentIdsInGroup = groups[idx] ?? []
      studentIdsInGroup.forEach((sid: string) => {
        members.push({ assignment_group_id: g.id, student_id: sid })
      })
    })
    if (members.length > 0) {
      const { error: membersErr } = await admin.from('assignment_group_members').insert(members)
      if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 })
    }

    return NextResponse.json({
      groups: insertedGroups.map((g: { id: string; sort_order: number }, idx: number) => ({
        id: g.id,
        name: `Group ${idx + 1}`,
        sort_order: g.sort_order,
        student_ids: groups[idx] ?? [],
      })),
    })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('create-groups error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

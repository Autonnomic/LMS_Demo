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
  let hasAccess = course.professor_id === user.id
  if (!hasAccess) {
    const { data: cp } = await admin.from('course_professors').select('professor_id').eq('course_id', courseId).eq('professor_id', user.id).maybeSingle()
    hasAccess = !!cp
  }
  if (!hasAccess) throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { admin, courseId }
}

/**
 * GET /api/professor/courses/[courseId]/assignments
 * List assignments for the course (server-side to avoid RLS hiding rows).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)

    const { data: assignmentsData, error: assignErr } = await admin
      .from('assignments')
      .select('*')
      .eq('course_id', courseId)
      .order('due_date', { ascending: true })

    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })
    const list = assignmentsData ?? []
    if (list.length === 0) return NextResponse.json({ assignments: [], submissionCounts: {} })

    const assignmentIds = list.map((a: { id: string }) => a.id)
    const { data: submissionRows } = await admin
      .from('assignment_submissions')
      .select('assignment_id, student_id')
      .in('assignment_id', assignmentIds)

    const countByAssignment: Record<string, number> = {}
    assignmentIds.forEach((id: string) => (countByAssignment[id] = 0))
    ;(submissionRows ?? []).forEach((r: { assignment_id: string }) => {
      countByAssignment[r.assignment_id] = (countByAssignment[r.assignment_id] || 0) + 1
    })

    const assignments = list.map((a: Record<string, unknown>) => ({
      ...a,
      submission_count: countByAssignment[a.id as string] ?? 0,
      is_published: a.is_published ?? true,
    }))
    return NextResponse.json({ assignments, submissionCounts: countByAssignment })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('assignments GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/professor/courses/[courseId]/assignments
 * Create an assignment (server-side to avoid RLS issues).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    const { admin } = await assertProfessorCourseAccess(courseId, request)

    const body = await request.json().catch(() => ({})) as {
      title?: string
      description?: string | null
      due_date?: string
      max_points?: number
      assignment_type?: string | null
      instructions?: string | null
      section_id?: string | null
      is_group_assignment?: boolean
      group_size?: number | null
      quiz_questions?: unknown
      show_grades_to_students?: boolean
    }

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const due_date = body.due_date ?? null
    const max_points = typeof body.max_points === 'number' ? body.max_points : 100

    const payload: Record<string, unknown> = {
      course_id: courseId,
      title,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      due_date,
      max_points,
      assignment_type: body.assignment_type ?? null,
      instructions: typeof body.instructions === 'string' ? body.instructions.trim() || null : null,
      is_published: false,
      section_id: body.section_id ?? null,
    }

    if (body.is_group_assignment === true && body.group_size != null && body.group_size >= 2) {
      payload.is_group_assignment = true
      payload.group_size = Math.floor(body.group_size)
    }

    if (body.assignment_type === 'quiz' && Array.isArray(body.quiz_questions) && body.quiz_questions.length > 0) {
      payload.quiz_questions = body.quiz_questions
      payload.show_grades_to_students = body.show_grades_to_students === true
    }

    const { data: assignment, error } = await admin
      .from('assignments')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Assignment insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(assignment)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('assignments POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

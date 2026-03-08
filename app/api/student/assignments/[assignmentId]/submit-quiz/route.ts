import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

interface QuizQuestion {
  question: string
  choices: string[]
  correct_index: number
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const supabase = await createClient()
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role to read role (RLS may block when auth is from Bearer token only)
    const admin = createServiceRoleClient()
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can submit quizzes' }, { status: 403 })
    }

    const { assignmentId } = await params
    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const quiz_answers = body.quiz_answers as unknown
    if (!Array.isArray(quiz_answers) || quiz_answers.some((a) => typeof a !== 'number')) {
      return NextResponse.json(
        { error: 'Invalid body: quiz_answers must be an array of numbers (choice indices)' },
        { status: 400 }
      )
    }

    const { data: assignment, error: assignErr } = await admin
      .from('assignments')
      .select('id, course_id, assignment_type, max_points, quiz_questions')
      .eq('id', assignmentId)
      .single()

    if (assignErr || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    if (assignment.assignment_type !== 'quiz') {
      return NextResponse.json({ error: 'This assignment is not a quiz' }, { status: 400 })
    }

    const questions = (assignment.quiz_questions ?? []) as QuizQuestion[]
    if (questions.length === 0) {
      return NextResponse.json({ error: 'Quiz has no questions' }, { status: 400 })
    }

    if (quiz_answers.length !== questions.length) {
      return NextResponse.json(
        { error: `Expected ${questions.length} answers, got ${quiz_answers.length}` },
        { status: 400 }
      )
    }

    const { data: enrollment } = await admin
      .from('course_registrations')
      .select('id')
      .eq('course_id', assignment.course_id)
      .eq('student_id', user.id)
      .eq('status', 'enrolled')
      .single()

    if (!enrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this course' }, { status: 403 })
    }

    const { data: existing } = await admin
      .from('assignment_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'You have already submitted this quiz. Only one attempt is allowed.' },
        { status: 400 }
      )
    }

    let correct = 0
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const studentChoice = quiz_answers[i]
      if (typeof studentChoice === 'number' && studentChoice >= 0 && studentChoice < (q.choices?.length ?? 0) && studentChoice === q.correct_index) {
        correct++
      }
    }
    const maxPoints = Number(assignment.max_points) || 100
    const grade = questions.length > 0 ? Math.round((correct / questions.length) * maxPoints * 100) / 100 : 0

    const { error: insertErr } = await admin.from('assignment_submissions').insert({
      assignment_id: assignmentId,
      student_id: user.id,
      quiz_answers,
      grade,
      status: 'submitted',
      submission_text: null,
      file_url: null,
      file_name: null,
    })

    if (insertErr) {
      console.error('Quiz submit insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, grade })
  } catch (e) {
    console.error('Submit quiz error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

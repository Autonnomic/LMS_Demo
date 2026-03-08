'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DocumentViewer from '@/app/dashboard/student/components/DocumentViewer'

interface Assignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  instructions: string | null
  show_grades_to_students?: boolean
}

interface EnrolledStudent {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  registration_id: string
  registered_at: string
}

interface Submission {
  id: string
  student_id: string
  submitted_at: string
  file_url: string | null
  file_name: string | null
  submission_text: string | null
  status: string
  grade: number | null
  feedback: string | null
  student: {
    first_name: string | null
    last_name: string | null
    email: string | null
  }
}

export default function AssignmentSubmissionsPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string
  const assignmentId = params.assignmentId as string
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [gradingSubmission, setGradingSubmission] = useState<string | null>(null)
  const [gradeInputValue, setGradeInputValue] = useState('')
  const [gradeValue, setGradeValue] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [viewingDocument, setViewingDocument] = useState<{ url: string; fileName: string } | null>(null)
  const [releasingGrades, setReleasingGrades] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          if (!cancelled && !user) router.replace('/')
          return
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, must_reset_password')
          .eq('id', user.id)
          .single()
        if (!profile || profile.role !== 'professor' || cancelled) {
          if (!cancelled) router.replace('/dashboard')
          return
        }
        if (profile.must_reset_password && !cancelled) {
          router.replace('/reset-password')
          return
        }

        const [assignmentRes, enrolledRes, submissionsRes] = await Promise.all([
          supabase.from('assignments').select('*').eq('id', assignmentId).eq('course_id', courseId).single(),
          (async () => {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: Record<string, string> = {}
            if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
            const res = await fetch(`/api/professor/courses/${courseId}/enrolled`, { credentials: 'include', headers })
            if (!res.ok) return null
            const json = await res.json().catch(() => null)
            return json?.enrolled ?? null
          })(),
          supabase
            .from('assignment_submissions')
            .select(`
              *,
              student:user_profiles ( first_name, last_name, email )
            `)
            .eq('assignment_id', assignmentId)
            .order('submitted_at', { ascending: false })
        ])

        if (!cancelled && assignmentRes.data) setAssignment(assignmentRes.data as Assignment)
        if (!cancelled && Array.isArray(enrolledRes)) setEnrolledStudents(enrolledRes as EnrolledStudent[])
        if (!cancelled && submissionsRes.data) {
          setSubmissions((submissionsRes.data as any[]).map((s) => ({ ...s, student: s.student })) as Submission[])
        }
      } catch (e) {
        console.error('Error loading submissions page:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [courseId, assignmentId, router])

  async function handleGradeSubmission(submissionId: string) {
    if (!assignment) return
    try {
      const maxPts = assignment.max_points ?? 100
      const numGrade = parseFloat(gradeInputValue.trim())
      const raw = Number.isFinite(numGrade) ? numGrade : 0
      const gradeToSave = Math.max(0, Math.min(maxPts, raw))

      const { error } = await supabase
        .from('assignment_submissions')
        .update({ grade: gradeToSave, feedback: feedbackText || null })
        .eq('id', submissionId)
      if (error) throw error

      const submission = submissions.find((s) => s.id === submissionId)
      if (submission) {
        const { data: existingGrade } = await supabase
          .from('grades')
          .select('id')
          .eq('student_id', submission.student_id)
          .eq('course_id', courseId)
          .eq('assignment_name', assignment.title)
          .single()

        if (existingGrade) {
          const { error: updateGradeError } = await supabase
            .from('grades')
            .update({ grade: gradeToSave, max_grade: assignment.max_points })
            .eq('id', existingGrade.id)
          if (updateGradeError) {
            console.error('Error updating grade:', updateGradeError)
            alert(`Grade saved to submission, but failed to update Grades tab: ${updateGradeError.message}`)
          }
        } else {
          const { error: insertGradeError } = await supabase
            .from('grades')
            .insert({
              student_id: submission.student_id,
              course_id: courseId,
              assignment_name: assignment.title,
              grade: gradeToSave,
              max_grade: assignment.max_points,
              assignment_type: assignment.assignment_type || null
            })
          if (insertGradeError) {
            console.error('Error inserting grade:', insertGradeError)
            alert(`Grade saved to submission, but failed to add to Grades tab: ${insertGradeError.message}`)
          }
        }
      }

      setGradingSubmission(null)
      setGradeValue(0)
      setGradeInputValue('')
      setFeedbackText('')
      const { data: updated } = await supabase
        .from('assignment_submissions')
        .select(`
          *,
          student:user_profiles ( first_name, last_name, email )
        `)
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false })
      if (updated) setSubmissions(updated.map((s: any) => ({ ...s, student: s.student })) as Submission[])

      const gradedSubmission = submissions.find((s) => s.id === submissionId)
      if (gradedSubmission) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          await fetch('/api/notifications/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
            },
            credentials: 'include',
            body: JSON.stringify({
              userId: gradedSubmission.student_id,
              title: 'Assignment Graded',
              message: `Your assignment "${assignment.title}" has been graded. Grade: ${gradeToSave} / ${assignment.max_points}`,
              type: 'grade',
              relatedId: assignment.id
            })
          })
        } catch (e) {
          console.error('Failed to create grade notification:', e)
        }
      }
    } catch (error) {
      console.error('Error grading submission:', error)
      alert('Failed to grade submission')
    }
  }

  function startGrading(submission: Submission) {
    setGradingSubmission(submission.id)
    const g = submission.grade
    setGradeValue(g ?? 0)
    setGradeInputValue(g != null ? String(g) : '')
    setFeedbackText(submission.feedback || '')
  }

  const submittedStudentIds = new Set(submissions.map((s) => s.student_id))
  const notSubmitted = enrolledStudents.filter((s) => !submittedStudentIds.has(s.id))

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Assignment not found.</p>
        <Link href={`/dashboard/professor/courses/${courseId}`} className="btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          ← Back to course
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href={`/dashboard/professor/courses/${courseId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--teal-bright)', textDecoration: 'none', fontSize: '0.9rem', marginBottom: '0.75rem' }}
        >
          ← Back to course
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy-dark)' }}>
          Submissions: {assignment.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          {submissions.length} / {enrolledStudents.length} students submitted
        </p>
        {assignment.assignment_type === 'quiz' && (
          <div style={{ marginTop: '0.75rem' }}>
            {assignment.show_grades_to_students ? (
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Grades and correct answers are visible to students.
              </span>
            ) : (
              <button
                type="button"
                disabled={releasingGrades}
                onClick={async () => {
                  setReleasingGrades(true)
                  try {
                    const { error } = await supabase
                      .from('assignments')
                      .update({ show_grades_to_students: true })
                      .eq('id', assignmentId)
                    if (error) throw error
                    setAssignment((a) => (a ? { ...a, show_grades_to_students: true } : null))
                  } catch (e) {
                    console.error(e)
                    alert('Failed to release grades')
                  } finally {
                    setReleasingGrades(false)
                  }
                }}
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
              >
                {releasingGrades ? 'Releasing…' : 'Release grades and correct answers to students'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Students who didn't submit */}
      {notSubmitted.length > 0 && (
        <section style={{ marginBottom: '2rem', padding: '1.25rem', background: '#fef3c7', borderRadius: 12, border: '1px solid #f59e0b' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
            Students who didn&apos;t submit ({notSubmitted.length})
          </h2>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.9rem', color: 'var(--text)' }}>
            {notSubmitted.map((s) => (
              <li key={s.id}>
                {[s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—'} {s.email && <span style={{ color: 'var(--text-muted)' }}>({s.email})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Submissions list */}
      <section>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
          Submissions ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center', background: 'var(--surface-hover)', borderRadius: 8 }}>
            No submissions yet for this assignment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {submissions.map((submission) => {
              const isGrading = gradingSubmission === submission.id
              const name = [submission.student.first_name, submission.student.last_name].filter(Boolean).join(' ').trim() || '—'
              return (
                <div
                  key={submission.id}
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#f9fafb',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text)', minWidth: '120px' }}>
                      {name}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Submitted: {new Date(submission.submitted_at).toLocaleString()}
                    </span>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: submission.grade !== null ? '#10b981' : 'var(--text-muted)' }}>
                      {submission.grade !== null ? `${submission.grade} / ${assignment.max_points}` : '—'}
                    </span>
                    {submission.file_url && (
                      <button
                        type="button"
                        onClick={() => setViewingDocument({ url: submission.file_url!, fileName: submission.file_name || 'document' })}
                        style={{ fontSize: '0.8125rem', color: 'var(--teal-bright)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      >
                        View submission
                      </button>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {isGrading ? (
                      <button
                        onClick={() => {
                          setGradingSubmission(null)
                          setGradeInputValue('')
                          setGradeValue(0)
                          setFeedbackText('')
                        }}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button onClick={() => startGrading(submission)} className="btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>
                        {submission.grade !== null ? 'Update Grade' : 'Grade Submission'}
                      </button>
                    )}
                  </div>

                  {isGrading && (
                    <div style={{ width: '100%', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', fontWeight: 500 }}>Grade (out of {assignment.max_points})</label>
                          <input
                            type="number"
                            value={gradeInputValue}
                            onChange={(e) => {
                              const maxPts = assignment.max_points ?? 100
                              const raw = e.target.value
                              const n = parseFloat(raw)
                              if (raw === '' || raw === '-') {
                                setGradeInputValue(raw)
                                setGradeValue(0)
                                return
                              }
                              if (!Number.isFinite(n)) return
                              const clamped = Math.max(0, Math.min(maxPts, n))
                              setGradeInputValue(String(clamped))
                              setGradeValue(clamped)
                            }}
                            className="form-control"
                            min={0}
                            max={assignment.max_points ?? 100}
                            step="0.1"
                            style={{ maxWidth: '120px' }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem', fontWeight: 500 }}>Feedback</label>
                          <input
                            type="text"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="form-control"
                            placeholder="Optional feedback..."
                            style={{ width: '100%' }}
                          />
                        </div>
                        <button onClick={() => handleGradeSubmission(submission.id)} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                          Save Grade
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url}
          fileName={viewingDocument.fileName}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </div>
  )
}

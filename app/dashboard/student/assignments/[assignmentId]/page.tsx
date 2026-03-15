'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../../components/Sidebar'
import Notifications from '../../components/Notifications'
import { ChatProvider } from '../../components/ChatContext'
import DocumentViewer from '../../components/DocumentViewer'
import UserMenu from '../../../components/UserMenu'

interface QuizQuestion {
  question: string
  choices: string[]
  correct_index: number
}

interface Assignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  instructions: string | null
  course: {
    id: string
    code: string
    name: string
  }
  quiz_questions?: QuizQuestion[] | null
  show_grades_to_students?: boolean
}

interface SubmissionFile {
  file_url: string
  file_name: string
}

interface Submission {
  id: string
  submitted_at: string
  updated_at: string | null
  file_url: string | null
  file_name: string | null
  submission_files?: SubmissionFile[] | null
  submission_text: string | null
  status: string
  grade: number | null
  feedback: string | null
  quiz_answers?: number[] | null
}

export default function AssignmentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.assignmentId as string
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submissionText, setSubmissionText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [viewingDocument, setViewingDocument] = useState<{ url: string; fileName: string } | null>(null)
  const [quizSelections, setQuizSelections] = useState<number[]>([])

  useEffect(() => {
    fetchAssignmentData()
  }, [assignmentId])

  async function fetchAssignmentData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Verify user is a student
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'student') {
        router.push('/dashboard')
        return
      }

      if (profile) {
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Student')
        setUserInitials(
          (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S'
        )
        setUserId(user.id)
      }

      // Fetch enrolled courses
      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'enrolled')

      if (coursesData) {
        const courseList = coursesData.map((reg: any) => reg.course).filter(Boolean)
        setCourses(courseList)
      }

      // Fetch assignment (include quiz fields for quiz type)
      const { data: assignmentData } = await supabase
        .from('assignments')
        .select(`
          id,
          title,
          description,
          due_date,
          max_points,
          assignment_type,
          instructions,
          quiz_questions,
          show_grades_to_students,
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('id', assignmentId)
        .single()

      if (assignmentData) {
        const course = Array.isArray(assignmentData.course)
          ? assignmentData.course[0]
          : assignmentData.course
        const normalized: Assignment = {
          ...assignmentData,
          course: course ?? { id: '', code: '', name: '' },
        }
        setAssignment(normalized)
        const a = normalized
        if (a.assignment_type === 'quiz' && Array.isArray(a.quiz_questions) && a.quiz_questions.length > 0) {
          setQuizSelections(a.quiz_questions.map(() => -1))
        }
      }

      // Fetch submission
      const { data: submissionData } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .single()

      if (submissionData) {
        setSubmission(submissionData as Submission)
        setSubmissionText(submissionData.submission_text || '')
      }
    } catch (error) {
      console.error('Error fetching assignment data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(file: File): Promise<string | null> {
    try {
      setUploading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${assignmentId}/${Date.now()}.${fileExt}`
      const filePath = fileName

      const { error: uploadError } = await supabase.storage
        .from('assignments')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage
        .from('assignments')
        .getPublicUrl(filePath)
      
      const publicUrl = data.publicUrl

      return publicUrl
    } catch (error) {
      console.error('Error uploading file:', error)
      throw error
    } finally {
      setUploading(false)
    }
  }

  function isPdfFile(file: File): boolean {
    const name = (file.name || '').toLowerCase()
    return name.endsWith('.pdf') || file.type === 'application/pdf'
  }

  async function handleSubmitQuiz(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!assignment || assignment.assignment_type !== 'quiz' || !assignment.quiz_questions?.length) return
    if (quizSelections.some((s) => s < 0)) {
      setError('Please answer all questions before submitting.')
      return
    }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/student/assignments/${assignmentId}/submit-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ quiz_answers: quizSelections }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to submit quiz')
        return
      }
      setSuccess('Quiz submitted successfully.')
      await fetchAssignmentData()
    } catch (err) {
      setError('Failed to submit quiz')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be logged in to submit')
        return
      }

      const canUpdateOnce = submission && submission.updated_at == null
      if (submission && !canUpdateOnce) {
        setError('You can only submit and update this assignment once. No further changes allowed.')
        return
      }

      const invalidFile = selectedFiles.find((f) => !isPdfFile(f))
      if (invalidFile) {
        setError('Only PDF files are accepted. Please upload .pdf files only.')
        return
      }

      let submissionFilesList: SubmissionFile[] = []
      if (submission?.submission_files && Array.isArray(submission.submission_files) && submission.submission_files.length > 0) {
        submissionFilesList = [...submission.submission_files]
      } else if (submission?.file_url && submission?.file_name) {
        submissionFilesList = [{ file_url: submission.file_url, file_name: submission.file_name }]
      }
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const url = await handleFileUpload(file)
          if (url) submissionFilesList.push({ file_url: url, file_name: file.name })
        }
      }
      const firstFile = submissionFilesList[0] ?? null
      const submissionPayload = {
        submission_text: submissionText || null,
        file_url: firstFile?.file_url ?? null,
        file_name: firstFile?.file_name ?? null,
        submission_files: submissionFilesList.length > 0 ? submissionFilesList : null,
        status: 'submitted',
        ...(canUpdateOnce ? { updated_at: new Date().toISOString() } : {})
      }

      if (canUpdateOnce) {
        const { error: updateError } = await supabase
          .from('assignment_submissions')
          .update(submissionPayload)
          .eq('id', submission!.id)
        if (updateError) throw updateError
      } else {
        const submissionData = {
          assignment_id: assignmentId,
          student_id: user.id,
          ...submissionPayload
        }
        const { error: insertError } = await supabase
          .from('assignment_submissions')
          .insert(submissionData)
        if (insertError) throw insertError
      }

      setSuccess(canUpdateOnce ? 'Submission updated successfully!' : 'Assignment submitted successfully!')
      await fetchAssignmentData()
      setSelectedFiles([])
    } catch (error: any) {
      console.error('Error submitting assignment:', error)
      setError(error.message || 'Failed to submit assignment')
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function isOverdue(): boolean {
    if (!assignment) return false
    const dueDate = new Date(assignment.due_date)
    return dueDate < new Date() && !submission
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">
                <span className="skeleton skeleton-text lg" style={{ width: '60%' }} />
              </h1>
              <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="skeleton skeleton-avatar" />
                <div className="canvas-user-menu-wrapper">
                  <div className="canvas-user-menu canvas-user-menu-trigger">
                    <div className="canvas-user-avatar skeleton" />
                    <div>
                      <div className="skeleton skeleton-text lg" style={{ width: '120px', marginBottom: '0.25rem' }} />
                      <div className="skeleton skeleton-text sm" style={{ width: '60px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="canvas-content-area">
              <div className="skeleton-card skeleton" style={{ marginBottom: '1.5rem' }}>
                <div className="skeleton skeleton-text sm" style={{ width: '30%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text lg" style={{ width: '70%', marginBottom: '0.75rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '80%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '60%' }} />
              </div>
              <div className="skeleton-card skeleton">
                <div className="skeleton skeleton-text sm" style={{ width: '40%', marginBottom: '0.75rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '90%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '85%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '75%' }} />
              </div>
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  if (!assignment) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <div className="canvas-main-content">
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <p>Assignment not found</p>
              <Link href="/dashboard/student/assignments" className="btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
                Back to Assignments
              </Link>
            </div>
          </div>
        </div>
      </ChatProvider>
    )
  }

  const dueDate = new Date(assignment.due_date)
  const isPastDue = isOverdue()

  return (
    <ChatProvider>
    <div className="canvas-layout">
      <Sidebar courses={courses} />
      
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <div>
            <Link 
              href="/dashboard/student/assignments"
              style={{ 
                fontSize: '0.875rem', 
                color: 'var(--text-muted)', 
                textDecoration: 'none',
                marginBottom: '0.5rem',
                display: 'block'
              }}
            >
              ← Back to Assignments
            </Link>
            <h1 className="canvas-topbar-title">{assignment.title}</h1>
          </div>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            <UserMenu
              userName={userName}
              userInitials={userInitials}
              onLogout={() => {
                import('@/lib/auth').then(({ logout }) => logout())
                router.push('/')
                router.refresh()
              }}
            />
          </div>
        </div>

        <div className="canvas-content-area">
          {error && (
            <div className="auth-error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#10b981',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              {success}
            </div>
          )}

          {/* Assignment Details */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2rem',
            marginBottom: '2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {assignment.course.code} - {assignment.course.name}
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  {assignment.title}
                </h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Due Date
                </div>
                <div style={{ 
                  fontSize: '1rem', 
                  fontWeight: 600,
                  color: isPastDue ? '#ef4444' : 'var(--text)'
                }}>
                  {formatDate(assignment.due_date)}
                </div>
                {isPastDue && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    Overdue
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Points
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                  {assignment.max_points}
                </div>
              </div>
              {assignment.assignment_type && (
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Type
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                    {assignment.assignment_type}
                  </div>
                </div>
              )}
            </div>

            {assignment.description && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
                  Description
                </h3>
                <p style={{ color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {assignment.description}
                </p>
              </div>
            )}

            {assignment.instructions && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
                  Instructions
                </h3>
                <p style={{ color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {assignment.instructions}
                </p>
              </div>
            )}
          </div>

          {/* Quiz: take once or already submitted */}
          {assignment.assignment_type === 'quiz' && (
            <>
              {!submission ? (
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '2rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #e5e7eb'
                }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text)' }}>
                    Take Quiz
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    You have one attempt. Answer all questions and submit.
                  </p>
                  {Array.isArray(assignment.quiz_questions) && assignment.quiz_questions.length > 0 ? (
                    <form onSubmit={handleSubmitQuiz}>
                      {assignment.quiz_questions.map((q, qIdx) => (
                        <div key={qIdx} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                            {qIdx + 1}. {q.question}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {(q.choices ?? []).map((choice, cIdx) => (
                              <label key={cIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`q-${qIdx}`}
                                  checked={quizSelections[qIdx] === cIdx}
                                  onChange={() => {
                                    const next = [...quizSelections]
                                    next[qIdx] = cIdx
                                    setQuizSelections(next)
                                  }}
                                />
                                <span style={{ color: 'var(--text)' }}>{choice}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={submitting || quizSelections.some((s) => s < 0)}
                      >
                        {submitting ? 'Submitting...' : 'Submit Quiz'}
                      </button>
                    </form>
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>No questions in this quiz.</p>
                  )}
                </div>
              ) : (
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '2rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #e5e7eb'
                }}>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text)' }}>
                    You have already submitted this quiz. Only one attempt is allowed.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Non-quiz: Submission Form - show when no submission or when one update is still allowed */}
          {assignment.assignment_type !== 'quiz' && (!submission || submission.updated_at == null) && (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text)' }}>
              {submission ? 'Update Submission' : 'Submit Assignment'}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              You can upload multiple PDF files per submission. {submission ? 'You can update once after your first submission.' : 'You can submit once and update once.'}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="submission-text" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                  Submission Text (Optional)
                </label>
                <textarea
                  id="submission-text"
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  className="form-control"
                  rows={6}
                  placeholder="Enter your submission text here..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="file-upload" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                  {submission ? 'Upload more PDFs (optional; adds to existing files)' : 'Upload PDFs (optional)'}
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    const invalid = files.find((f) => !isPdfFile(f))
                    if (invalid) {
                      setError('Only PDF files are accepted.')
                      setSelectedFiles([])
                      e.target.value = ''
                      return
                    }
                    setError(null)
                    setSelectedFiles(files)
                    e.target.value = ''
                  }}
                  className="form-control"
                  style={{ padding: '0.5rem' }}
                />
                {submission && (submission.submission_files?.length || (submission.file_url && submission.file_name)) && selectedFiles.length === 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Current files: {(submission.submission_files ?? (submission.file_name ? [{ file_name: submission.file_name }] : [])).map((f) => f.file_name).join(', ')}
                  </div>
                )}
                {selectedFiles.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    New files ({selectedFiles.length}): {selectedFiles.map((f) => f.name).join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || uploading || (!submissionText && selectedFiles.length === 0 && !(submission?.file_url) && !(submission?.submission_files?.length))}
                >
                  {uploading ? 'Uploading...' : submitting ? (submission ? 'Updating...' : 'Submitting...') : submission ? 'Update Submission' : 'Submit Assignment'}
                </button>
                {submission && (
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    First submitted: {formatDate(submission.submitted_at)}
                  </span>
                )}
              </div>
            </form>
          </div>
          )}

          {assignment.assignment_type !== 'quiz' && submission && submission.updated_at != null && (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-muted)' }}>
              You have submitted and used your one update. No further changes are allowed.
            </p>
          </div>
          )}

          {/* Submission History / Grade */}
          {submission && (
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '2rem',
              marginTop: '2rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text)' }}>
                Submission Details
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Submitted At
                  </div>
                  <div style={{ fontSize: '1rem', color: 'var(--text)' }}>
                    {formatDate(submission.submitted_at)}
                  </div>
                </div>

                {assignment.assignment_type === 'quiz' ? (
                  <>
                    {!assignment.show_grades_to_students ? (
                      <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '6px', color: 'var(--text)' }}>
                        Submitted. Grade and correct answers are hidden until your instructor releases them.
                      </div>
                    ) : (
                      <>
                        {submission.grade !== null && (
                          <div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                              Grade
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981' }}>
                              {submission.grade} / {assignment.max_points}
                            </div>
                          </div>
                        )}
                        {Array.isArray(assignment.quiz_questions) && assignment.quiz_questions.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                              Correct answers
                            </div>
                            {assignment.quiz_questions.map((q, qIdx) => {
                              const studentChoice = submission.quiz_answers?.[qIdx]
                              const correct = studentChoice === q.correct_index
                              const correctChoice = (q.choices ?? [])[q.correct_index]
                              return (
                                <div key={qIdx} style={{ marginBottom: '1rem', padding: '0.75rem', background: correct ? '#ecfdf5' : '#fef2f2', borderRadius: '6px', border: `1px solid ${correct ? '#10b981' : '#ef4444'}` }}>
                                  <div style={{ fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text)' }}>{q.question}</div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    Correct answer: {correctChoice ?? '—'}
                                  </div>
                                  {studentChoice !== undefined && (
                                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: correct ? '#059669' : '#dc2626' }}>
                                      {correct ? 'You got it right.' : `You selected: ${(q.choices ?? [])[studentChoice] ?? '—'}`}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {(submission.submission_files?.length || (submission.file_url && submission.file_name)) ? (
                      <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          Submitted Files
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {(submission.submission_files ?? [{ file_url: submission.file_url!, file_name: submission.file_name || 'document' }]).map((f, idx) => (
                            <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setViewingDocument({ url: f.file_url, fileName: f.file_name || 'document' })}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  background: 'var(--teal-bright)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.875rem',
                                  cursor: 'pointer'
                                }}
                              >
                                View
                              </button>
                              <a
                                href={f.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--teal-bright)', textDecoration: 'none', fontSize: '0.875rem' }}
                              >
                                {f.file_name} ↗
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {submission.grade !== null && (
                      <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Grade
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981' }}>
                          {submission.grade} / {assignment.max_points}
                        </div>
                      </div>
                    )}
                    {submission.feedback && (
                      <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Feedback
                        </div>
                        <div style={{ 
                          padding: '1rem', 
                          background: '#f9fafb', 
                          borderRadius: '6px',
                          color: 'var(--text)',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {submission.feedback}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url}
          fileName={viewingDocument.fileName}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </div>
    </ChatProvider>
  )
}

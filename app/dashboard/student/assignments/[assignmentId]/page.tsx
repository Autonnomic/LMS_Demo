'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../../components/Sidebar'
import Notifications from '../../components/Notifications'
import { ChatProvider } from '../../components/ChatContext'

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
}

interface Submission {
  id: string
  submitted_at: string
  file_url: string | null
  file_name: string | null
  submission_text: string | null
  status: string
  grade: number | null
  feedback: string | null
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

      // Fetch assignment
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
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('id', assignmentId)
        .single()

      if (assignmentData) {
        setAssignment(assignmentData as Assignment)
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

      let fileUrl = submission?.file_url || null
      let fileName = submission?.file_name || null

      // Upload file if selected
      if (selectedFile) {
        fileUrl = await handleFileUpload(selectedFile)
        fileName = selectedFile.name
      }

      // Create or update submission
      const submissionData: any = {
        assignment_id: assignmentId,
        student_id: user.id,
        submission_text: submissionText || null,
        file_url: fileUrl,
        file_name: fileName,
        status: 'submitted'
      }

      if (submission) {
        // Update existing submission
        const { error: updateError } = await supabase
          .from('assignment_submissions')
          .update(submissionData)
          .eq('id', submission.id)

        if (updateError) throw updateError
      } else {
        // Create new submission
        const { error: insertError } = await supabase
          .from('assignment_submissions')
          .insert(submissionData)

        if (insertError) throw insertError
      }

      setSuccess('Assignment submitted successfully!')
      await fetchAssignmentData()
      setSelectedFile(null)
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
          <div className="canvas-main-content">
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <p>Loading assignment...</p>
            </div>
          </div>
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
            <div className="canvas-user-menu" onClick={() => {
              supabase.auth.signOut()
              router.push('/')
              router.refresh()
            }}>
              <div className="canvas-user-avatar">{userInitials}</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
                  {userName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Logout
                </div>
              </div>
            </div>
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

          {/* Submission Form */}
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
                  Upload File (Optional)
                </label>
                <input
                  id="file-upload"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="form-control"
                  style={{ padding: '0.5rem' }}
                />
                {submission?.file_name && !selectedFile && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Current file: <a href={submission.file_url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-bright)' }}>
                      {submission.file_name}
                    </a>
                  </div>
                )}
                {selectedFile && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Selected: {selectedFile.name}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || uploading || (!submissionText && !selectedFile && !submission)}
                >
                  {uploading ? 'Uploading...' : submitting ? 'Submitting...' : submission ? 'Update Submission' : 'Submit Assignment'}
                </button>
                {submission && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Last submitted: {formatDate(submission.submitted_at)}
                  </div>
                )}
              </div>
            </form>
          </div>

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
                {submission.file_name && (
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Submitted File
                    </div>
                    <div>
                      <a 
                        href={submission.file_url || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: 'var(--teal-bright)', textDecoration: 'none' }}
                      >
                        {submission.file_name} ↗
                      </a>
                    </div>
                  </div>
                )}
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
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
    </ChatProvider>
  )
}

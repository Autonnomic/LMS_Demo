'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Notifications from '../../../student/components/Notifications'
import DocumentViewer from '../../../student/components/DocumentViewer'

interface Course {
  id: string
  code: string
  name: string
  description: string | null
  credits: number
  semester: string | null
  academic_year: string | null
}

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
}

interface Student {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface EnrolledStudent extends Student {
  registration_id: string
  registered_at: string
}

interface AttendanceRecord {
  student_id: string
  date: string
  status: string
  notes: string | null
}

interface Assignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  instructions: string | null
  submission_count?: number
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

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ProfessorCourseDetail() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<Course | null>(null)
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'schedule' | 'students' | 'assignments'>('overview')
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [newSchedule, setNewSchedule] = useState({
    day_of_week: 1,
    start_time: '10:00',
    end_time: '11:30',
    location: ''
  })
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [viewingSubmissions, setViewingSubmissions] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const submissionsListRef = useRef<HTMLDivElement>(null)
  const [gradingSubmission, setGradingSubmission] = useState<string | null>(null)
  const [gradeValue, setGradeValue] = useState<number>(0)
  const [feedbackText, setFeedbackText] = useState<string>('')
  const [viewingDocument, setViewingDocument] = useState<{ url: string; fileName: string } | null>(null)
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    max_points: 100,
    assignment_type: '',
    instructions: ''
  })
  const [assignmentTemplates, setAssignmentTemplates] = useState([
    { name: 'Homework', type: 'homework', points: 100, description: 'Weekly homework assignment' },
    { name: 'Quiz', type: 'quiz', points: 50, description: 'Short quiz assessment' },
    { name: 'Project', type: 'project', points: 200, description: 'Major project assignment' },
    { name: 'Exam', type: 'exam', points: 300, description: 'Final exam' },
    { name: 'Lab', type: 'lab', points: 100, description: 'Laboratory assignment' }
  ])

  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          if (!cancelled && !user) router.push('/')
          return
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, role, must_reset_password')
          .eq('id', user.id)
          .single()
        if (!profile || profile.role !== 'professor' || cancelled) {
          if (!cancelled) router.push('/dashboard')
          return
        }
        if (profile.must_reset_password && !cancelled) {
          router.replace('/reset-password')
          return
        }
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
        setUserInitials((firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P')
        setCurrentUserId(user.id)
        await Promise.all([
          fetchCourseData(),
          fetchAssignments()
        ])
      } catch (error) {
        console.error('Error loading course page:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadInitial()
    return () => { cancelled = true }
  }, [courseId])

  useEffect(() => {
    if (courseId && attendanceDate) {
      fetchAttendanceForDate(attendanceDate)
    }
  }, [attendanceDate, courseId])

  // Defer loading all students until user opens Students tab
  useEffect(() => {
    if (activeTab === 'students') {
      fetchAllStudents()
    }
  }, [activeTab, courseId])

  async function fetchAllStudents() {
    try {
      const { data: allStudentsData } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .eq('role', 'student')
        .order('last_name', { ascending: true })
      if (allStudentsData) {
        const enrolledIds = new Set(enrolledStudents.map((s) => s.id))
        setAllStudents(allStudentsData.filter((s) => !enrolledIds.has(s.id)))
      }
    } catch (error) {
      console.error('Error fetching all students:', error)
    }
  }

  async function fetchCourseData() {
    try {
      const [courseRes, scheduleRes, studentsRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase
          .from('course_schedules')
          .select('*')
          .eq('course_id', courseId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('course_registrations')
          .select(`
            id,
            registered_at,
            student:user_profiles (
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('course_id', courseId)
          .eq('status', 'enrolled')
      ])
      if (courseRes.data) setCourse(courseRes.data)
      if (scheduleRes.data) setSchedule(scheduleRes.data)
      if (studentsRes.data) {
        const enrolled = studentsRes.data.map((reg: any) => ({
          ...reg.student,
          registration_id: reg.id,
          registered_at: reg.registered_at
        }))
        setEnrolledStudents(enrolled)
      }
      await fetchAttendanceForDate(attendanceDate)
    } catch (error) {
      console.error('Error fetching course data:', error)
    }
  }

  async function fetchAssignments() {
    try {
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('*')
        .eq('course_id', courseId)
        .order('due_date', { ascending: true })
      if (!assignmentsData?.length) {
        if (assignmentsData) setAssignments(assignmentsData)
        return
      }
      const assignmentIds = assignmentsData.map((a: Assignment) => a.id)
      const { data: submissionRows } = await supabase
        .from('assignment_submissions')
        .select('assignment_id')
        .in('assignment_id', assignmentIds)
      const countByAssignment: Record<string, number> = {}
      assignmentIds.forEach((id) => (countByAssignment[id] = 0))
      submissionRows?.forEach((r: { assignment_id: string }) => {
        countByAssignment[r.assignment_id] = (countByAssignment[r.assignment_id] || 0) + 1
      })
      setAssignments(
        assignmentsData.map((a: Assignment) => ({
          ...a,
          submission_count: countByAssignment[a.id] ?? 0
        }))
      )
    } catch (error) {
      console.error('Error fetching assignments:', error)
    }
  }

  async function handleCreateAssignment(e: React.FormEvent) {
    e.preventDefault()
    try {
      const dueDateTime = newAssignment.due_date && newAssignment.due_time
        ? `${newAssignment.due_date}T${newAssignment.due_time}:00`
        : newAssignment.due_date

      // Save assignment data before resetting
      const assignmentTitle = newAssignment.title
      const assignmentDueDate = dueDateTime

      const { data: insertedAssignment, error } = await supabase
        .from('assignments')
        .insert({
          course_id: courseId,
          title: newAssignment.title,
          description: newAssignment.description || null,
          due_date: dueDateTime,
          max_points: newAssignment.max_points,
          assignment_type: newAssignment.assignment_type || null,
          instructions: newAssignment.instructions || null
        })
        .select()
        .single()

      if (error) throw error

      setShowAssignmentForm(false)
      setNewAssignment({
        title: '',
        description: '',
        due_date: '',
        due_time: '',
        max_points: 100,
        assignment_type: '',
        instructions: ''
      })
      await fetchAssignments()
      
      // Create notifications for all enrolled students
      if (insertedAssignment) {
        try {
          const { data: enrolledStudents } = await supabase
            .from('course_registrations')
            .select('student_id')
            .eq('course_id', courseId)
            .eq('status', 'enrolled')

          if (enrolledStudents) {
            // Get session token for authentication
            const { data: { session } } = await supabase.auth.getSession()
            
            for (const enrollment of enrolledStudents) {
              try {
                const response = await fetch('/api/notifications/create', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    userId: enrollment.student_id,
                    title: 'New Assignment',
                    message: `New assignment "${assignmentTitle}" has been posted. Due: ${assignmentDueDate ? new Date(assignmentDueDate).toLocaleString() : 'No due date'}`,
                    type: 'assignment',
                    relatedId: insertedAssignment.id
                  })
                })
                if (!response.ok) {
                  const error = await response.json()
                  console.error('Failed to create notification:', error)
                }
              } catch (err) {
                console.error('Error creating notification:', err)
              }
            }
          }
        } catch (notifError) {
          console.error('Error creating notifications:', notifError)
          // Don't fail the assignment creation if notifications fail
        }
      }
    } catch (error) {
      console.error('Error creating assignment:', error)
      alert('Failed to create assignment')
    }
  }

  async function handleUpdateAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!editingAssignment) return

    try {
      const dueDateTime = newAssignment.due_date && newAssignment.due_time
        ? `${newAssignment.due_date}T${newAssignment.due_time}:00`
        : newAssignment.due_date

      const { error } = await supabase
        .from('assignments')
        .update({
          title: newAssignment.title,
          description: newAssignment.description || null,
          due_date: dueDateTime,
          max_points: newAssignment.max_points,
          assignment_type: newAssignment.assignment_type || null,
          instructions: newAssignment.instructions || null
        })
        .eq('id', editingAssignment.id)

      if (error) throw error

      setEditingAssignment(null)
      setShowAssignmentForm(false)
      setNewAssignment({
        title: '',
        description: '',
        due_date: '',
        due_time: '',
        max_points: 100,
        assignment_type: '',
        instructions: ''
      })
      await fetchAssignments()
    } catch (error) {
      console.error('Error updating assignment:', error)
      alert('Failed to update assignment')
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!confirm('Are you sure you want to delete this assignment? This will also delete all submissions.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error

      await fetchAssignments()
    } catch (error) {
      console.error('Error deleting assignment:', error)
      alert('Failed to delete assignment')
    }
  }

  function useTemplate(template: typeof assignmentTemplates[0]) {
    setNewAssignment({
      title: '',
      description: template.description,
      due_date: '',
      due_time: '',
      max_points: template.points,
      assignment_type: template.type,
      instructions: ''
    })
    setShowAssignmentForm(true)
  }

  function startEditAssignment(assignment: Assignment) {
    const dueDate = new Date(assignment.due_date)
    setEditingAssignment(assignment)
    setNewAssignment({
      title: assignment.title,
      description: assignment.description || '',
      due_date: dueDate.toISOString().split('T')[0],
      due_time: dueDate.toTimeString().slice(0, 5),
      max_points: assignment.max_points,
      assignment_type: assignment.assignment_type || '',
      instructions: assignment.instructions || ''
    })
    setShowAssignmentForm(true)
  }

  async function fetchSubmissions(assignmentId: string) {
    try {
      const { data: submissionsData } = await supabase
        .from('assignment_submissions')
        .select(`
          *,
          student:user_profiles (
            first_name,
            last_name,
            email
          )
        `)
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false })

      if (submissionsData) {
        const submissionsList = submissionsData.map((s: any) => ({
          ...s,
          student: s.student
        })) as Submission[]
        setSubmissions(submissionsList)
        setViewingSubmissions(assignmentId)
      }
    } catch (error) {
      console.error('Error fetching submissions:', error)
      alert('Failed to load submissions')
    }
  }

  useEffect(() => {
    if (viewingSubmissions && submissionsListRef.current) {
      const el = submissionsListRef.current
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [viewingSubmissions])

  async function handleGradeSubmission(submissionId: string, assignment: Assignment) {
    try {
      const { error } = await supabase
        .from('assignment_submissions')
        .update({
          grade: gradeValue,
          feedback: feedbackText || null
        })
        .eq('id', submissionId)

      if (error) throw error

      // Also create/update grade entry
      const submission = submissions.find(s => s.id === submissionId)
      if (submission) {
        // Check if grade already exists
        const { data: existingGrade } = await supabase
          .from('grades')
          .select('id')
          .eq('student_id', submission.student_id)
          .eq('course_id', courseId)
          .eq('assignment_name', assignment.title)
          .single()

        if (existingGrade) {
          // Update existing grade
          await supabase
            .from('grades')
            .update({
              grade: gradeValue,
              max_grade: assignment.max_points
            })
            .eq('id', existingGrade.id)
        } else {
          // Insert new grade
          await supabase
            .from('grades')
            .insert({
              student_id: submission.student_id,
              course_id: courseId,
              assignment_name: assignment.title,
              grade: gradeValue,
              max_grade: assignment.max_points,
              assignment_type: assignment.assignment_type || null
            })
        }
      }

      setGradingSubmission(null)
      setGradeValue(0)
      setFeedbackText('')
      await fetchSubmissions(assignment.id)
      
      // Create notification for student about grade
      try {
        const submission = submissions.find(s => s.id === submissionId)
        if (submission) {
          // Get session token for authentication
          const { data: { session } } = await supabase.auth.getSession()
          
          const response = await fetch('/api/notifications/create', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
            },
            credentials: 'include',
            body: JSON.stringify({
              userId: submission.student_id,
              title: 'Assignment Graded',
              message: `Your assignment "${assignment.title}" has been graded. Grade: ${gradeValue} / ${assignment.max_points}`,
              type: 'grade',
              relatedId: assignment.id
            })
          })
          if (!response.ok) {
            const error = await response.json()
            console.error('Failed to create grade notification:', error)
          }
        }
      } catch (notifError) {
        console.error('Error creating grade notification:', notifError)
        // Don't fail grading if notification fails
      }
    } catch (error) {
      console.error('Error grading submission:', error)
      alert('Failed to grade submission')
    }
  }

  function startGrading(submission: Submission, assignment: Assignment) {
    setGradingSubmission(submission.id)
    setGradeValue(submission.grade || 0)
    setFeedbackText(submission.feedback || '')
  }

  async function fetchAttendanceForDate(date: string) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('course_id', courseId)
      .eq('date', date)

    if (data) {
      const records: Record<string, AttendanceRecord> = {}
      data.forEach(record => {
        records[record.student_id] = {
          student_id: record.student_id,
          date: record.date,
          status: record.status,
          notes: record.notes
        }
      })
      setAttendanceRecords(records)
    }
  }

  async function handleTakeAttendance() {
    try {
      const records = Object.values(attendanceRecords)
      const operations = records.map(record => {
        return supabase
          .from('attendance')
          .upsert({
            student_id: record.student_id,
            course_id: courseId,
            date: attendanceDate,
            status: record.status,
            notes: record.notes || null
          }, {
            onConflict: 'student_id,course_id,date'
          })
      })

      await Promise.all(operations)
      alert('Attendance saved successfully!')
    } catch (error) {
      console.error('Error saving attendance:', error)
      alert('Error saving attendance')
    }
  }

  function updateAttendanceStatus(studentId: string, status: string) {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        date: attendanceDate,
        status,
        notes: prev[studentId]?.notes || null
      }
    }))
  }

  async function handleAddSchedule() {
    try {
      const { error } = await supabase
        .from('course_schedules')
        .insert({
          course_id: courseId,
          day_of_week: newSchedule.day_of_week,
          start_time: newSchedule.start_time + ':00',
          end_time: newSchedule.end_time + ':00',
          location: newSchedule.location || null
        })

      if (error) throw error

      setNewSchedule({
        day_of_week: 1,
        start_time: '10:00',
        end_time: '11:30',
        location: ''
      })
      fetchCourseData()
      alert('Schedule added successfully!')
    } catch (error) {
      console.error('Error adding schedule:', error)
      alert('Error adding schedule')
    }
  }

  async function handleUpdateSchedule(scheduleId: string) {
    try {
      const { error } = await supabase
        .from('course_schedules')
        .update({
          day_of_week: editingSchedule!.day_of_week,
          start_time: editingSchedule!.start_time,
          end_time: editingSchedule!.end_time,
          location: editingSchedule!.location || null
        })
        .eq('id', scheduleId)

      if (error) throw error

      setEditingSchedule(null)
      fetchCourseData()
      alert('Schedule updated successfully!')
    } catch (error) {
      console.error('Error updating schedule:', error)
      alert('Error updating schedule')
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!confirm('Are you sure you want to delete this schedule?')) return

    try {
      const { error } = await supabase
        .from('course_schedules')
        .delete()
        .eq('id', scheduleId)

      if (error) throw error

      fetchCourseData()
      alert('Schedule deleted successfully!')
    } catch (error) {
      console.error('Error deleting schedule:', error)
      alert('Error deleting schedule')
    }
  }

  async function handleEnrollStudent(studentId: string) {
    try {
      const { error } = await supabase
        .from('course_registrations')
        .insert({
          student_id: studentId,
          course_id: courseId,
          status: 'enrolled'
        })

      if (error) {
        if (error.code === '23505') {
          alert('Student is already enrolled in this course')
        } else {
          throw error
        }
        return
      }

      await fetchCourseData()
      alert('Student enrolled successfully!')
    } catch (error) {
      console.error('Error enrolling student:', error)
      alert('Error enrolling student')
    }
  }

  async function handleUnenrollStudent(registrationId: string) {
    if (!confirm('Are you sure you want to unenroll this student?')) return

    try {
      const { error } = await supabase
        .from('course_registrations')
        .update({ status: 'withdrawn' })
        .eq('id', registrationId)

      if (error) throw error

      fetchCourseData()
      alert('Student unenrolled successfully!')
    } catch (error) {
      console.error('Error unenrolling student:', error)
      alert('Error unenrolling student')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  function formatTime(timeString: string) {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  if (loading) {
    return (
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="skeleton skeleton-avatar" />
            <div className="canvas-user-menu">
              <div className="canvas-user-avatar skeleton" />
              <div>
                <div className="skeleton skeleton-text lg" style={{ width: '120px', marginBottom: '0.25rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '60px' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="canvas-content-area">
          <div className="skeleton skeleton-text lg" style={{ width: '50%', marginBottom: '1.5rem' }} />
          <div className="professor-tabs">
            {[1, 2, 3, 4].map((i) => (
              <button key={i} className="professor-tab" type="button">
                <span className="skeleton skeleton-text sm" style={{ width: '64px' }} />
              </button>
            ))}
          </div>
          <div className="skeleton-card skeleton">
            <div className="skeleton skeleton-text lg" style={{ width: '40%', marginBottom: '0.75rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '90%', marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '80%', marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '70%' }} />
          </div>
        </div>
      </main>
    )
  }

  if (!course) {
    return (
      <main className="canvas-main-content">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <p>Course not found</p>
          <Link href="/dashboard/professor" style={{ color: 'var(--teal-bright)' }}>
            Back to Dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="canvas-main-content">
        <div className="canvas-topbar">
          <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
          <h1 className="canvas-topbar-title course-topbar-title">{course.code} - {course.name}</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {currentUserId && <Notifications userId={currentUserId} />}
            <div className="canvas-user-menu" onClick={handleLogout}>
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
          {/* Tabs */}
          <div className="professor-tabs">
            <button
              className={`professor-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`professor-tab ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              Attendance
            </button>
            <button
              className={`professor-tab ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              Schedule
            </button>
            <button
              className={`professor-tab ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              Students
            </button>
            <button
              className={`professor-tab ${activeTab === 'assignments' ? 'active' : ''}`}
              onClick={() => setActiveTab('assignments')}
            >
              Assignments
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div 
                className="course-detail-header"
                style={{
                  background: `linear-gradient(135deg, #0892A5 0%, #0CA4A5 100%)`
                }}
              >
                <h1>{course.code} - {course.name}</h1>
                {course.description && (
                  <p style={{ marginTop: '0.5rem', opacity: 0.95 }}>
                    {course.description}
                  </p>
                )}
                <div className="course-detail-header-meta">
                  <span>{course.credits} Credits</span>
                  {course.semester && <span>{course.semester} {course.academic_year}</span>}
                  <span>{enrolledStudents.length} Students</span>
                </div>
              </div>

              <div className="course-detail-content">
                <div className="course-detail-main">
                  <div className="course-info-card">
                    <h3>Class Schedule</h3>
                    {schedule.length > 0 ? (
                      <div>
                        {schedule.map((sched) => (
                          <div key={sched.id} className="schedule-item">
                            <div className="schedule-day">{daysOfWeek[sched.day_of_week]}</div>
                            <div className="schedule-time">
                              {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                            </div>
                            {sched.location && (
                              <div className="schedule-location">📍 {sched.location}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)' }}>No schedule set</p>
                    )}
                  </div>
                </div>

                <div className="course-detail-sidebar">
                  <div className="course-info-card">
                    <h3>Enrolled Students ({enrolledStudents.length})</h3>
                    {enrolledStudents.length > 0 ? (
                      <div className="student-list">
                        {enrolledStudents.slice(0, 10).map((student) => (
                          <div key={student.id} className="student-item">
                            <div className="student-avatar">
                              {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                            </div>
                            <div className="student-info">
                              <div className="student-name">
                                {student.first_name} {student.last_name}
                              </div>
                            </div>
                          </div>
                        ))}
                        {enrolledStudents.length > 10 && (
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            +{enrolledStudents.length - 10} more
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3>Take Attendance</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => {
                        setAttendanceDate(e.target.value)
                        fetchAttendanceForDate(e.target.value)
                      }}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <button
                      onClick={handleTakeAttendance}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1.5rem', width: 'auto' }}
                    >
                      Save Attendance
                    </button>
                  </div>
                </div>

                {enrolledStudents.length > 0 ? (
                  <div className="attendance-table">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Student</th>
                          <th style={{ textAlign: 'center', padding: '0.75rem', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrolledStudents.map((student) => {
                          const currentStatus = attendanceRecords[student.id]?.status || 'present'
                          return (
                            <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '0.75rem' }}>
                                {student.first_name} {student.last_name}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <select
                                  value={currentStatus}
                                  onChange={(e) => updateAttendanceStatus(student.id, e.target.value)}
                                  style={{
                                    padding: '0.5rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="late">Late</option>
                                  <option value="excused">Excused</option>
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <h3>Class Schedule</h3>
                
                {/* Existing Schedules */}
                {schedule.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    {schedule.map((sched) => (
                      <div key={sched.id} className="schedule-item" style={{ position: 'relative' }}>
                        {editingSchedule?.id === sched.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <select
                              value={editingSchedule.day_of_week}
                              onChange={(e) => setEditingSchedule({
                                ...editingSchedule,
                                day_of_week: parseInt(e.target.value)
                              })}
                              style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                            >
                              {daysOfWeek.map((day, idx) => (
                                <option key={idx} value={idx}>{day}</option>
                              ))}
                            </select>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="time"
                                value={editingSchedule.start_time.substring(0, 5)}
                                onChange={(e) => setEditingSchedule({
                                  ...editingSchedule,
                                  start_time: e.target.value + ':00'
                                })}
                                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', flex: 1 }}
                              />
                              <input
                                type="time"
                                value={editingSchedule.end_time.substring(0, 5)}
                                onChange={(e) => setEditingSchedule({
                                  ...editingSchedule,
                                  end_time: e.target.value + ':00'
                                })}
                                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', flex: 1 }}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Location"
                              value={editingSchedule.location || ''}
                              onChange={(e) => setEditingSchedule({
                                ...editingSchedule,
                                location: e.target.value
                              })}
                              style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleUpdateSchedule(sched.id)}
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem', width: 'auto', fontSize: '0.875rem' }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSchedule(null)}
                                className="btn-secondary"
                                style={{ padding: '0.5rem 1rem', width: 'auto', fontSize: '0.875rem' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="schedule-day">{daysOfWeek[sched.day_of_week]}</div>
                            <div className="schedule-time">
                              {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                            </div>
                            {sched.location && (
                              <div className="schedule-location">📍 {sched.location}</div>
                            )}
                            <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => setEditingSchedule(sched)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  background: 'var(--teal-bright)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(sched.id)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  background: 'var(--error)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Schedule */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>Add New Schedule</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <select
                      value={newSchedule.day_of_week}
                      onChange={(e) => setNewSchedule({
                        ...newSchedule,
                        day_of_week: parseInt(e.target.value)
                      })}
                      style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                    >
                      {daysOfWeek.map((day, idx) => (
                        <option key={idx} value={idx}>{day}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="time"
                        value={newSchedule.start_time}
                        onChange={(e) => setNewSchedule({
                          ...newSchedule,
                          start_time: e.target.value
                        })}
                        placeholder="Start Time"
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1 }}
                      />
                      <input
                        type="time"
                        value={newSchedule.end_time}
                        onChange={(e) => setNewSchedule({
                          ...newSchedule,
                          end_time: e.target.value
                        })}
                        placeholder="End Time"
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1 }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Location (e.g., Room 101)"
                      value={newSchedule.location}
                      onChange={(e) => setNewSchedule({
                        ...newSchedule,
                        location: e.target.value
                      })}
                      style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                    />
                    <button
                      onClick={handleAddSchedule}
                      className="btn-primary"
                      style={{ padding: '0.75rem 1.5rem', width: 'auto' }}
                    >
                      Add Schedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <h3>Enrolled Students ({enrolledStudents.length})</h3>
                {enrolledStudents.length > 0 ? (
                  <div className="student-list">
                    {enrolledStudents.map((student) => (
                      <div key={student.id} className="student-item" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="student-avatar">
                            {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                          </div>
                          <div className="student-info">
                            <div className="student-name">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {student.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnenrollStudent(student.registration_id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--error)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Unenroll
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>

              <div className="course-info-card" style={{ marginTop: '2rem' }}>
                <h3>Add Students to Course</h3>
                {allStudents.length > 0 ? (
                  <div className="student-list">
                    {allStudents.map((student) => (
                      <div key={student.id} className="student-item" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="student-avatar">
                            {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                          </div>
                          <div className="student-info">
                            <div className="student-name">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {student.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEnrollStudent(student.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--teal-bright)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Enroll
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>All students are already enrolled</p>
                )}
              </div>
            </div>
          )}

          {/* Assignments Tab */}
          {activeTab === 'assignments' && (
            <div className="professor-tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3>Assignments ({assignments.length})</h3>
                <button
                  onClick={() => {
                    setEditingAssignment(null)
                    setNewAssignment({
                      title: '',
                      description: '',
                      due_date: '',
                      due_time: '',
                      max_points: 100,
                      assignment_type: '',
                      instructions: ''
                    })
                    setShowAssignmentForm(true)
                  }}
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  + Create Assignment
                </button>
              </div>

              {/* Assignment Templates */}
              {!showAssignmentForm && (
                <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                    Quick Templates
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {assignmentTemplates.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => useTemplate(template)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: 'var(--text)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--teal-bright)'
                          e.currentTarget.style.color = 'var(--teal-bright)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db'
                          e.currentTarget.style.color = 'var(--text)'
                        }}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignment Form */}
              {showAssignmentForm && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text)' }}>
                    {editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}
                  </h4>
                  <form onSubmit={editingAssignment ? handleUpdateAssignment : handleCreateAssignment}>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                        Title *
                      </label>
                      <input
                        type="text"
                        value={newAssignment.title}
                        onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                        className="form-control"
                        required
                        placeholder="Assignment title"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                        Description
                      </label>
                      <textarea
                        value={newAssignment.description}
                        onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                        className="form-control"
                        rows={3}
                        placeholder="Assignment description"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                          Due Date *
                        </label>
                        <input
                          type="date"
                          value={newAssignment.due_date}
                          onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                          className="form-control"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                          Due Time
                        </label>
                        <input
                          type="time"
                          value={newAssignment.due_time}
                          onChange={(e) => setNewAssignment({ ...newAssignment, due_time: e.target.value })}
                          className="form-control"
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                          Max Points *
                        </label>
                        <input
                          type="number"
                          value={newAssignment.max_points}
                          onChange={(e) => setNewAssignment({ ...newAssignment, max_points: parseFloat(e.target.value) || 0 })}
                          className="form-control"
                          required
                          min="0"
                          step="0.1"
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                          Type
                        </label>
                        <select
                          value={newAssignment.assignment_type}
                          onChange={(e) => setNewAssignment({ ...newAssignment, assignment_type: e.target.value })}
                          className="form-control"
                        >
                          <option value="">Select type</option>
                          <option value="homework">Homework</option>
                          <option value="quiz">Quiz</option>
                          <option value="project">Project</option>
                          <option value="exam">Exam</option>
                          <option value="lab">Lab</option>
                          <option value="essay">Essay</option>
                          <option value="presentation">Presentation</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                        Instructions
                      </label>
                      <textarea
                        value={newAssignment.instructions}
                        onChange={(e) => setNewAssignment({ ...newAssignment, instructions: e.target.value })}
                        className="form-control"
                        rows={4}
                        placeholder="Detailed instructions for students"
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn-primary">
                        {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAssignmentForm(false)
                          setEditingAssignment(null)
                          setNewAssignment({
                            title: '',
                            description: '',
                            due_date: '',
                            due_time: '',
                            max_points: 100,
                            assignment_type: '',
                            instructions: ''
                          })
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Assignments List */}
              {assignments.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Due Date</th>
                        <th>Points</th>
                        <th>Submissions</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => {
                        const dueDate = new Date(assignment.due_date)
                        const isOverdue = dueDate < new Date()
                        return (
                          <tr key={assignment.id}>
                            <td>
                              <div style={{ fontWeight: 500 }}>{assignment.title}</div>
                              {assignment.description && (
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  {assignment.description.substring(0, 50)}
                                  {assignment.description.length > 50 ? '...' : ''}
                                </div>
                              )}
                            </td>
                            <td>
                              {assignment.assignment_type ? (
                                <span style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  background: '#f3f4f6',
                                  color: 'var(--text)'
                                }}>
                                  {assignment.assignment_type}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td>
                              <div style={{ color: isOverdue ? '#ef4444' : 'var(--text)' }}>
                                {dueDate.toLocaleDateString()}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td>{assignment.max_points}</td>
                            <td>
                              <button
                                onClick={() => fetchSubmissions(assignment.id)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  background: assignment.submission_count && assignment.submission_count > 0 ? 'var(--teal-bright)' : '#9ca3af',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: 600
                                }}
                              >
                                {assignment.submission_count || 0} Submission{(assignment.submission_count || 0) !== 1 ? 's' : ''}
                              </button>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => fetchSubmissions(assignment.id)}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'var(--teal-bright)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => startEditAssignment(assignment)}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteAssignment(assignment.id)}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  {showAssignmentForm ? null : <p>No assignments yet. Create your first assignment!</p>}
                </div>
              )}

              {/* Submissions View */}
              {viewingSubmissions && (
                <div ref={submissionsListRef} style={{ marginTop: '2rem', padding: '1.5rem', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3>
                      Submissions for: {assignments.find(a => a.id === viewingSubmissions)?.title}
                    </h3>
                    <button
                      onClick={() => {
                        setViewingSubmissions(null)
                        setSubmissions([])
                      }}
                      className="btn-secondary"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Close
                    </button>
                  </div>

                  {submissions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {submissions.map((submission) => {
                        const assignment = assignments.find(a => a.id === viewingSubmissions)
                        const isGrading = gradingSubmission === submission.id
                        return (
                          <div
                            key={submission.id}
                            style={{
                              padding: '1.5rem',
                              background: '#f9fafb',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                              <div>
                                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                                  {submission.student.first_name} {submission.student.last_name}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                  {submission.student.email}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                  Submitted: {new Date(submission.submitted_at).toLocaleString()}
                                </div>
                              </div>
                              {submission.grade !== null && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                    Grade
                                  </div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                                    {submission.grade} / {assignment?.max_points || 0}
                                  </div>
                                </div>
                              )}
                            </div>

                            {submission.submission_text && (
                              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
                                  Submission Text:
                                </div>
                                <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                                  {submission.submission_text}
                                </div>
                              </div>
                            )}

                            {submission.file_name && (
                              <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
                                  Submitted File:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => submission.file_url && setViewingDocument({ url: submission.file_url, fileName: submission.file_name || 'document' })}
                                    disabled={!submission.file_url}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      padding: '0.5rem 1rem',
                                      background: 'var(--teal-bright)',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '0.875rem',
                                      cursor: submission.file_url ? 'pointer' : 'not-allowed'
                                    }}
                                  >
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    View
                                  </button>
                                  <a
                                    href={submission.file_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      padding: '0.5rem 1rem',
                                      background: 'var(--bg)',
                                      color: 'var(--text)',
                                      textDecoration: 'none',
                                      borderRadius: '6px',
                                      fontSize: '0.875rem',
                                      border: '1px solid var(--border)'
                                    }}
                                  >
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    {submission.file_name}
                                  </a>
                                </div>
                              </div>
                            )}

                            {submission.feedback && (
                              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
                                  Feedback:
                                </div>
                                <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                                  {submission.feedback}
                                </div>
                              </div>
                            )}

                            {isGrading ? (
                              <div style={{ padding: '1rem', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                <div style={{ marginBottom: '1rem' }}>
                                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                                    Grade (out of {assignment?.max_points || 0})
                                  </label>
                                  <input
                                    type="number"
                                    value={gradeValue}
                                    onChange={(e) => setGradeValue(parseFloat(e.target.value) || 0)}
                                    className="form-control"
                                    min="0"
                                    max={assignment?.max_points || 100}
                                    step="0.1"
                                    style={{ maxWidth: '200px' }}
                                  />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                                    Feedback
                                  </label>
                                  <textarea
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    className="form-control"
                                    rows={4}
                                    placeholder="Provide feedback to the student..."
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button
                                    onClick={() => assignment && handleGradeSubmission(submission.id, assignment)}
                                    className="btn-primary"
                                    style={{ padding: '0.5rem 1rem' }}
                                  >
                                    Save Grade
                                  </button>
                                  <button
                                    onClick={() => {
                                      setGradingSubmission(null)
                                      setGradeValue(0)
                                      setFeedbackText('')
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: '0.5rem 1rem' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => assignment && startGrading(submission, assignment)}
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem' }}
                              >
                                {submission.grade !== null ? 'Update Grade' : 'Grade Submission'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p>No submissions yet for this assignment.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url}
          fileName={viewingDocument.fileName}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </main>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Notifications from '../../../student/components/Notifications'
import DocumentViewer from '../../../student/components/DocumentViewer'
import UserMenu from '../../../components/UserMenu'

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

interface CourseMaterial {
  id: string
  course_id: string
  file_name: string
  file_path: string
  created_at: string
}

interface CourseGrade {
  id: string
  student_id: string
  course_id: string
  assignment_name: string
  grade: number
  max_grade: number | null
  assignment_type: string | null
  graded_at: string | null
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
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'schedule' | 'students' | 'assignments' | 'grades' | 'materials'>('overview')
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
  const [viewingDocument, setViewingDocument] = useState<{ url: string; fileName: string } | null>(null)
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [materialUploading, setMaterialUploading] = useState(false)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [ragProcessMessage, setRagProcessMessage] = useState<string | null>(null)
  const [indexingMaterialId, setIndexingMaterialId] = useState<string | null>(null)
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    max_points: 100,
    assignment_type: '',
    instructions: ''
  })
  const [courseGrades, setCourseGrades] = useState<CourseGrade[]>([])
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
          fetchAssignments(),
          fetchCourseGrades()
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

  useEffect(() => {
    if (activeTab === 'materials' && courseId) {
      fetchCourseMaterials()
    }
  }, [activeTab, courseId])

  // Refetch grades when opening Grades tab so it shows latest data after grading in Assignments tab
  useEffect(() => {
    if (activeTab === 'grades' && courseId) {
      fetchCourseGrades()
      fetchAssignments()
    }
  }, [activeTab, courseId])

  async function fetchCourseMaterials() {
    if (!courseId) return
    setMaterialsLoading(true)
    try {
      const { data, error } = await supabase
        .from('course_materials')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setMaterials(data || [])
    } catch (err) {
      console.error('Error fetching course materials:', err)
      setMaterials([])
    } finally {
      setMaterialsLoading(false)
    }
  }

  function isPdfFile(file: File): boolean {
    const name = (file.name || '').toLowerCase()
    if (!name.endsWith('.pdf')) return false
    return file.type === 'application/pdf' || file.type === ''
  }

  async function handleUploadMaterial(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !courseId) return
    if (!isPdfFile(file)) {
      setMaterialError('Only PDF files are allowed.')
      return
    }
    setMaterialError(null)
    setRagProcessMessage(null)
    setMaterialUploading(true)
    try {
      const ext = file.name.toLowerCase().endsWith('.pdf') ? '.pdf' : '.pdf'
      const baseName = file.name.replace(/\.pdf$/i, '') || 'document'
      const sanitized = baseName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)
      const filePath = `${courseId}/${crypto.randomUUID()}_${sanitized}${ext}`
      const { error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(filePath, file, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw uploadError
      const { data: insertedMaterial, error: insertError } = await supabase
        .from('course_materials')
        .insert({ course_id: courseId, file_name: file.name, file_path: filePath })
        .select('id')
        .single()
      if (insertError) throw insertError
      await fetchCourseMaterials()
      if (insertedMaterial?.id) {
        setRagProcessMessage('Processing PDF for search…')
        const { data: { session } } = await supabase.auth.getSession()
        fetch('/api/course-materials/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          body: JSON.stringify({ materialId: insertedMaterial.id }),
        })
          .then((r) => r.json())
          .then((body) => {
            if (body.error) {
              setRagProcessMessage(`RAG failed: ${body.error}`)
            } else {
              setRagProcessMessage(body.chunks ? `Ready: ${body.chunks} chunks indexed for search.` : null)
            }
          })
          .catch((err) => setRagProcessMessage(`RAG failed: ${err?.message || 'request failed'}`))
      }
    } catch (err: any) {
      setMaterialError(err?.message || 'Failed to upload. Only PDF is allowed.')
    } finally {
      setMaterialUploading(false)
    }
  }

  function getMaterialPublicUrl(filePath: string): string {
    const { data } = supabase.storage.from('course-materials').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function handleIndexForSearch(m: CourseMaterial) {
    setRagProcessMessage(null)
    setIndexingMaterialId(m.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/course-materials/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ materialId: m.id }),
      })
      const body = await res.json()
      if (!res.ok) {
        setRagProcessMessage(`RAG failed: ${body.error || res.statusText}`)
        return
      }
      setRagProcessMessage(body.chunks != null ? `Ready: ${body.chunks} chunks indexed for search.` : 'Indexed.')
    } catch (err: any) {
      setRagProcessMessage(`RAG failed: ${err?.message || 'request failed'}`)
    } finally {
      setIndexingMaterialId(null)
    }
  }

  async function handleDeleteMaterial(m: CourseMaterial) {
    if (!confirm(`Remove "${m.file_name}" from course materials?`)) return
    try {
      await supabase.storage.from('course-materials').remove([m.file_path])
      const { error } = await supabase.from('course_materials').delete().eq('id', m.id)
      if (error) throw error
      await fetchCourseMaterials()
    } catch (err) {
      console.error('Error deleting material:', err)
      alert('Failed to remove material.')
    }
  }

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
      const [courseRes, scheduleRes, enrolledRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase
          .from('course_schedules')
          .select('*')
          .eq('course_id', courseId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
        (async () => {
          const { data: { session } } = await supabase.auth.getSession()
          const headers: Record<string, string> = {}
          if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
          const res = await fetch(`/api/professor/courses/${courseId}/enrolled`, { credentials: 'include', headers })
          if (!res.ok) return null
          const json = await res.json().catch(() => null)
          return json?.enrolled ?? null
        })()
      ])
      if (courseRes.data) setCourse(courseRes.data)
      if (scheduleRes.data) setSchedule(scheduleRes.data)
      if (Array.isArray(enrolledRes)) {
        setEnrolledStudents(enrolledRes as EnrolledStudent[])
      }
      await fetchAttendanceForDate(attendanceDate)
    } catch (error) {
      console.error('Error fetching course data:', error)
    }
  }

  async function fetchCourseGrades() {
    try {
      const { data, error } = await supabase
        .from('grades')
        .select('*')
        .eq('course_id', courseId)
        .order('assignment_name')
      if (error) throw error
      setCourseGrades((data || []) as CourseGrade[])
    } catch (error) {
      console.error('Error fetching grades:', error)
      setCourseGrades([])
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
          professor_id: currentUserId,
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
          <div className="canvas-topbar-brand">
            <span className="skeleton skeleton-text lg canvas-topbar-title" style={{ width: '180px' }} />
            <span className="skeleton canvas-topbar-logo-mobile" style={{ width: 48, height: 48, borderRadius: 8 }} />
          </div>
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
          <div className="canvas-topbar-brand">
            <h1 className="canvas-topbar-title course-topbar-title">{course.code} - {course.name}</h1>
            <img src="/logo.png" alt="" className="canvas-topbar-logo-mobile" />
          </div>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {currentUserId && <Notifications userId={currentUserId} />}
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
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
            <button
              className={`professor-tab ${activeTab === 'grades' ? 'active' : ''}`}
              onClick={() => setActiveTab('grades')}
            >
              Grades
            </button>
            <button
              className={`professor-tab ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              Materials
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

                  {/* Grades & Analytics (overview) */}
                  <div className="course-info-card" style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h3>Grades &amp; Analytics</h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('grades')}
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'var(--teal-bright)',
                          background: 'transparent',
                          border: '1px solid var(--teal-bright)',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        View full grades →
                      </button>
                    </div>
                    {(() => {
                      const totalPoints = courseGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                      const earnedPoints = courseGrades.reduce((s, g) => s + Number(g.grade), 0)
                      const classAvgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null
                      // Count only current assignments that have at least one grade (matches table columns)
                      const assignmentsGradedCount = assignments.filter((a) =>
                        courseGrades.some((g) => g.assignment_name === a.title)
                      ).length
                      const perStudentPct: number[] = []
                      enrolledStudents.forEach((stu) => {
                        const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                        const stuTotal = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                        const stuEarned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                        if (stuTotal > 0) perStudentPct.push((stuEarned / stuTotal) * 100)
                      })
                      const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
                      perStudentPct.forEach((p) => {
                        if (p >= 90) dist.A++
                        else if (p >= 80) dist.B++
                        else if (p >= 70) dist.C++
                        else if (p >= 60) dist.D++
                        else dist.F++
                      })
                      const studentsByGradeCount = [...enrolledStudents]
                        .map((stu) => {
                          const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                          const total = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                          const earned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                          const pct = total > 0 ? Math.round((earned / total) * 100) : null
                          return { student: stu, count: stuGrades.length, pct }
                        })
                        .sort((a, b) => a.count - b.count)
                      const studentsWithFewerGrades = studentsByGradeCount.slice(0, 10)
                      return (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                            <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Class average</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{classAvgPct != null ? `${classAvgPct}%` : '—'}</div>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Assignments graded</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{assignmentsGradedCount}</div>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Distribution</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#059669' }}>A ({dist.A})</span>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.2)', color: '#2563eb' }}>B ({dist.B})</span>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>C ({dist.C})</span>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.2)', color: '#ea580c' }}>D ({dist.D})</span>
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#dc2626' }}>F ({dist.F})</span>
                              </div>
                            </div>
                          </div>
                          {enrolledStudents.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Students with fewer grades (need attention)</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.875rem' }}>
                                {studentsWithFewerGrades.map(({ student, pct }) => (
                                  <span key={student.id} style={{ padding: '4px 8px', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.email || 'Unknown'} ({pct != null ? `${pct}%` : '—'})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    {courseGrades.length === 0 && assignments.length === 0 && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Create assignments and grade submissions to see analytics here.</p>
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
                        <th>Submitted</th>
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
                            <td style={{ fontSize: '0.875rem', color: 'var(--text)' }}>
                              {assignment.submission_count ?? 0} / {enrolledStudents.length}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <Link
                                  href={`/dashboard/professor/courses/${courseId}/assignments/${assignment.id}/submissions`}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'var(--teal-bright)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    textDecoration: 'none',
                                    display: 'inline-block'
                                  }}
                                >
                                  View submissions
                                </Link>
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

            </div>
          )}

          {/* Grades & Analytics Tab */}
          {activeTab === 'grades' && (
            <div className="professor-tab-content">
              <h3 style={{ marginBottom: '1.5rem', color: 'var(--navy-dark)' }}>Grades &amp; Analytics</h3>

              {/* Analytics cards */}
              {(() => {
                const totalPoints = courseGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                const earnedPoints = courseGrades.reduce((s, g) => s + Number(g.grade), 0)
                const classAvgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
                // Count only current assignments that have at least one grade (matches table columns)
                const assignmentsGradedCount = assignments.filter((a) =>
                  courseGrades.some((g) => g.assignment_name === a.title)
                ).length
                const perStudentPct: number[] = []
                enrolledStudents.forEach((stu) => {
                  const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                  const stuTotal = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                  const stuEarned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                  if (stuTotal > 0) perStudentPct.push((stuEarned / stuTotal) * 100)
                })
                const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
                perStudentPct.forEach((p) => {
                  if (p >= 90) dist.A++
                  else if (p >= 80) dist.B++
                  else if (p >= 70) dist.C++
                  else if (p >= 60) dist.D++
                  else dist.F++
                })
                const studentsByGradeCount = [...enrolledStudents]
                  .map((stu) => {
                    const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                    const total = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                    const earned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                    const pct = total > 0 ? Math.round((earned / total) * 100) : null
                    return { student: stu, count: stuGrades.length, pct }
                  })
                  .sort((a, b) => a.count - b.count)
                const studentsWithFewerGrades = studentsByGradeCount.slice(0, 15)
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Class average</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>{classAvgPct}%</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{earnedPoints.toFixed(0)} / {totalPoints.toFixed(0)} pts</div>
                      </div>
                      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Assignments graded</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>{assignmentsGradedCount}</div>
                      </div>
                      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Grade distribution</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.8rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#059669' }}>A 90+ ({dist.A})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.2)', color: '#2563eb' }}>B 80–89 ({dist.B})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>C 70–79 ({dist.C})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(249,115,22,0.2)', color: '#ea580c' }}>D 60–69 ({dist.D})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#dc2626' }}>F &lt;60 ({dist.F})</span>
                        </div>
                      </div>
                    </div>
                    {enrolledStudents.length > 0 && (
                      <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Students with fewer grades (need attention)</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.9rem' }}>
                          {studentsWithFewerGrades.map(({ student, pct }) => (
                            <span key={student.id} style={{ padding: '6px 10px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.email || 'Unknown'} ({pct != null ? `${pct}%` : '—'})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Grades table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>Student</th>
                      {assignments.map((a) => (
                        <th key={a.id} style={{ textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 120 }} title={a.title}>
                          {a.title.length > 18 ? a.title.slice(0, 16) + '…' : a.title}
                        </th>
                      ))}
                      <th style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600 }}>Average</th>
                    </tr>
                    {/* Class average row */}
                    {assignments.length > 0 && (
                      <tr style={{ background: 'var(--surface-hover)', fontSize: '0.85rem' }}>
                        <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Class avg</td>
                        {assignments.map((a) => {
                          const gs = courseGrades.filter((g) => g.assignment_name === a.title)
                          const total = gs.reduce((s, g) => s + (g.max_grade || 0), 0)
                          const earned = gs.reduce((s, g) => s + Number(g.grade), 0)
                          const pct = total > 0 ? Math.round((earned / total) * 100) : null
                          return (
                            <td key={a.id} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                              {pct != null ? `${pct}%` : '—'}
                            </td>
                          )
                        })}
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {courseGrades.length > 0
                            ? `${Math.round((courseGrades.reduce((s, g) => s + Number(g.grade), 0) / courseGrades.reduce((s, g) => s + (g.max_grade || 0), 0)) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {enrolledStudents.length === 0 ? (
                      <tr>
                        <td colSpan={(assignments.length + 2)} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          No enrolled students
                        </td>
                      </tr>
                    ) : (
                      enrolledStudents.map((student) => {
                        const stuGrades = courseGrades.filter((g) => g.student_id === student.id)
                        let totalPoints = 0
                        let earnedPoints = 0
                        stuGrades.forEach((g) => {
                          totalPoints += g.max_grade || 0
                          earnedPoints += Number(g.grade)
                        })
                        const avgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null
                        return (
                          <tr key={student.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.email || '—'}
                            </td>
                            {assignments.map((a) => {
                              const g = stuGrades.find((gr) => gr.assignment_name === a.title)
                              if (!g) return <td key={a.id} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                              const max = g.max_grade ?? a.max_points
                              return (
                                <td key={a.id} style={{ textAlign: 'center' }}>
                                  {Number(g.grade)} / {max}
                                </td>
                              )
                            })}
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                              {avgPct != null ? `${avgPct}%` : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {assignments.length === 0 && (
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
                  Create assignments and grade submissions in the Assignments tab to see grades and analytics here.
                </p>
              )}
            </div>
          )}

          {/* Materials Tab */}
          {activeTab === 'materials' && (
            <div className="professor-tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3>Course materials (PDF only)</h3>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--teal-bright)', color: 'white', borderRadius: '8px', cursor: materialUploading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleUploadMaterial}
                    disabled={materialUploading}
                    style={{ display: 'none' }}
                  />
                  {materialUploading ? (
                    <span>Uploading…</span>
                  ) : (
                    <>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload PDF
                    </>
                  )}
                </label>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                After uploading, click <strong>Index for search</strong> to enable semantic search over the PDF (requires Ollama running with nomic-embed-text).
              </p>
              {materialError && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {materialError}
                </div>
              )}
              {ragProcessMessage && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: ragProcessMessage.startsWith('RAG failed') ? '#fef2f2' : '#f0fdf4', color: ragProcessMessage.startsWith('RAG failed') ? '#b91c1c' : '#166534', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {ragProcessMessage}
                </div>
              )}
              {materialsLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading materials…</p>
              ) : materials.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <span style={{ color: '#dc2626', flexShrink: 0 }}>
                          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                            <path fill="currentColor" d="M14 2v6h6M16 13H8m0 4h8m-4-4H8" />
                          </svg>
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleIndexForSearch(m)}
                          disabled={indexingMaterialId === m.id}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                          title="Extract text and index for semantic search (RAG)"
                        >
                          {indexingMaterialId === m.id ? 'Indexing…' : 'Index for search'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingDocument({ url: getMaterialPublicUrl(m.file_path), fileName: m.file_name })}
                          className="btn-primary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(m)}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No course materials yet. Upload PDFs above.</p>
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
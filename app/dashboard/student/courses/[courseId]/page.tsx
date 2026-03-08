'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../../components/Sidebar'
import { useChat } from '../../components/ChatContext'
import Chat from '../../components/Chat'
import Notifications from '../../components/Notifications'
import { ChatProvider } from '../../components/ChatContext'
import UserMenu from '../../../components/UserMenu'
import DocumentViewer from '../../components/DocumentViewer'

interface Course {
  id: string
  code: string
  name: string
  description: string | null
  credits: number
  semester: string | null
  academic_year: string | null
  professor: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
}

interface EnrolledStudent {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface CourseTopic {
  id: string
  title: string
  description: string | null
  scheduled_date: string
}

interface CourseAssignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  submission?: { id: string; status: string; grade: number | null } | null
}

interface CourseMaterial {
  id: string
  course_id: string
  file_name: string
  file_path: string
  created_at: string
}

interface Announcement {
  id: string
  course_id: string
  author_id: string
  title: string
  content: string
  created_at: string
  author?: { first_name: string | null; last_name: string | null } | null
}

function CourseDetailPageContent() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string
  const { setStartWithUserId, setOpenChat } = useChat()
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<Course | null>(null)
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [upcomingTopics, setUpcomingTopics] = useState<CourseTopic[]>([])
  const [courseAssignments, setCourseAssignments] = useState<CourseAssignment[]>([])
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')
  const [activeCourseTab, setActiveCourseTab] = useState<'overview' | 'materials' | 'announcements'>('overview')
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [viewingMaterial, setViewingMaterial] = useState<{ url: string; fileName: string } | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
          .select('first_name, last_name, role')
          .eq('id', user.id)
          .single()
        if (profile) {
          const firstName = profile.first_name || ''
          const lastName = profile.last_name || ''
          setUserName(`${firstName} ${lastName}`.trim() || 'Student')
          setUserInitials(
            (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S'
          )
          setCurrentUserId(user.id)
          setUserRole(profile.role as 'student' | 'professor')
        }
        await Promise.all([
          fetchCourseData(user.id),
          fetchAllCourses(user.id)
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
    if (activeCourseTab === 'materials' && courseId) {
      setMaterialsLoading(true)
      Promise.resolve(
        supabase
          .from('course_materials')
          .select('*')
          .eq('course_id', courseId)
          .order('created_at', { ascending: false })
      )
        .then(({ data, error }) => {
          if (!error) setCourseMaterials(data || [])
          else setCourseMaterials([])
        })
        .finally(() => setMaterialsLoading(false))
    }
  }, [activeCourseTab, courseId])

  useEffect(() => {
    if (activeCourseTab === 'announcements' && courseId) {
      setAnnouncementsLoading(true)
      Promise.resolve(
        supabase
          .from('announcements')
          .select(`
          id,
          course_id,
          author_id,
          title,
          content,
          created_at,
          author:user_profiles(first_name, last_name)
        `)
          .eq('course_id', courseId)
          .order('created_at', { ascending: false })
      )
        .then(({ data, error }) => {
          if (error) {
            setAnnouncements([])
            return
          }
          const list = (data || []).map((row: { author?: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] }) => ({
            ...row,
            author: Array.isArray(row.author) ? row.author[0] ?? null : row.author ?? null
          }))
          setAnnouncements(list as Announcement[])
        })
        .finally(() => setAnnouncementsLoading(false))
    }
  }, [activeCourseTab, courseId])

  function getMaterialUrl(filePath: string): string {
    const { data } = supabase.storage.from('course-materials').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function fetchAllCourses(studentId: string) {
    try {
      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'enrolled')
      if (coursesData) {
        setAllCourses(coursesData.map((reg: any) => reg.course).filter(Boolean))
      }
    } catch (error) {
      console.error('Error fetching courses:', error)
    }
  }

  async function fetchCourseData(studentId: string) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [courseRes, scheduleRes, topicsRes, assignmentsRes, studentsRes, submissionsRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id,
            code,
            name,
            description,
            credits,
            semester,
            academic_year,
            professor:user_profiles (
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('id', courseId)
          .single(),
        supabase
          .from('course_schedules')
          .select('*')
          .eq('course_id', courseId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('course_topics')
          .select('*')
          .eq('course_id', courseId)
          .gte('scheduled_date', today)
          .order('scheduled_date', { ascending: true })
          .limit(5),
        supabase
          .from('assignments')
          .select('id, title, description, due_date, max_points, assignment_type')
          .eq('course_id', courseId)
          .order('due_date', { ascending: true }),
        supabase.rpc('get_enrolled_students', { p_course_id: courseId }),
        supabase
          .from('assignment_submissions')
          .select('assignment_id, id, status, grade')
          .eq('student_id', studentId)
      ])
      if (courseRes.data) {
        const raw = courseRes.data as { professor?: unknown } & Omit<Course, 'professor'>
        const professor = Array.isArray(raw.professor) ? raw.professor[0] ?? null : (raw.professor ?? null) as Course['professor']
        setCourse({ ...raw, professor })
      }
      if (scheduleRes.data) setSchedule(scheduleRes.data)
      if (topicsRes.data) setUpcomingTopics(topicsRes.data)
      if (studentsRes.error) {
        console.error('Error fetching enrolled students:', studentsRes.error)
        const { data: fallbackData } = await supabase
          .from('course_registrations')
          .select(`
            student_id,
            student:user_profiles!course_registrations_student_id_fkey(
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('course_id', courseId)
          .eq('status', 'enrolled')
        if (fallbackData) {
          setEnrolledStudents(
            fallbackData
              .filter((reg: any) => reg.student)
              .map((reg: any) => ({
                id: reg.student.id,
                first_name: reg.student.first_name,
                last_name: reg.student.last_name,
                email: reg.student.email
              }))
          )
        }
      } else if (studentsRes.data) {
        setEnrolledStudents(
          studentsRes.data.map((s: any) => ({
            id: s.student_id,
            first_name: s.first_name,
            last_name: s.last_name,
            email: s.email
          }))
        )
      }
      const submissionsData = submissionsRes.data || []
      const submissionsMap = new Map(
        submissionsData.map((s: { assignment_id: string; id: string; status: string; grade: number | null }) => [
          s.assignment_id,
          { id: s.id, status: s.status, grade: s.grade }
        ])
      )
      if (assignmentsRes.data) {
        setCourseAssignments(
          assignmentsRes.data.map((a: any) => ({
            ...a,
            submission: submissionsMap.get(a.id) || null
          }))
        )
      }
    } catch (error) {
      console.error('Error fetching course data:', error)
    }
  }

  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function getInitials(firstName: string | null, lastName: string | null) {
    const first = firstName?.charAt(0) || ''
    const last = lastName?.charAt(0) || ''
    return (first + last).toUpperCase() || '?'
  }

  function getAssignmentStatus(a: CourseAssignment): 'pending' | 'submitted' | 'graded' | 'overdue' {
    const now = new Date()
    const dueDate = new Date(a.due_date)
    if (a.submission && a.submission.grade != null) return 'graded'
    if (a.submission) return 'submitted'
    if (dueDate < now) return 'overdue'
    return 'pending'
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'graded': return 'Graded'
      case 'submitted': return 'Submitted'
      case 'overdue': return 'Overdue'
      default: return 'Pending'
    }
  }

  // Generate course color based on course ID (shared palette with calendar)
  function getCourseColor(courseId: string) {
    const palette = [
      '#0892A5', // teal
      '#2563EB', // blue
      '#10B981', // green
      '#F97316', // orange
      '#EC4899', // pink
      '#8B5CF6', // purple
      '#F59E0B', // amber
      '#EF4444', // red
    ]
    const hash = courseId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    const colorIndex = Math.abs(hash) % palette.length
    const primary = palette[colorIndex]
    const secondary = palette[(colorIndex + 1) % palette.length]
    return { primary, secondary }
  }

  if (loading) {
    return (
      <div className="canvas-layout">
        <Sidebar courses={[]} />
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <h1 className="canvas-topbar-title course-topbar-title">
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
    )
  }

  if (!course) {
    return (
      <div className="canvas-layout">
        <Sidebar courses={allCourses.map(c => ({ id: c.id, code: c.code, name: c.name }))} />
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Course not found</p>
            <Link href="/dashboard/student" style={{ color: 'var(--teal-bright)' }}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-layout">
      {/* Sidebar */}
      <Sidebar courses={allCourses.map(c => ({ id: c.id, code: c.code, name: c.name }))} />

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title course-topbar-title">{course.code} - {course.name}</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {currentUserId && <Notifications userId={currentUserId} />}
            {currentUserId && <Chat userId={currentUserId} userRole={userRole} hideTriggerButton />}
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
          </div>
        </div>

        <div className="canvas-content-area">
          <div 
            className="course-detail-header"
            style={{
              background: `linear-gradient(135deg, ${getCourseColor(course.id).primary} 0%, ${getCourseColor(course.id).secondary} 100%)`
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
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setActiveCourseTab('overview')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: activeCourseTab === 'overview' ? 'var(--teal-bright)' : 'var(--surface)',
                color: activeCourseTab === 'overview' ? 'white' : 'var(--text)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.9rem'
              }}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveCourseTab('materials')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: activeCourseTab === 'materials' ? 'var(--teal-bright)' : 'var(--surface)',
                color: activeCourseTab === 'materials' ? 'white' : 'var(--text)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.9rem'
              }}
            >
              Materials
            </button>
            <button
              type="button"
              onClick={() => setActiveCourseTab('announcements')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: activeCourseTab === 'announcements' ? 'var(--teal-bright)' : 'var(--surface)',
                color: activeCourseTab === 'announcements' ? 'white' : 'var(--text)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.9rem'
              }}
            >
              Announcements
            </button>
          </div>

          {activeCourseTab === 'overview' && (
          <div className="course-detail-content">
            <div className="course-detail-main">
              {/* Schedule */}
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
                  <p style={{ color: 'var(--text-muted)' }}>No schedule available</p>
                )}
              </div>

              {/* Assignments for this course */}
              <div className="course-info-card">
                <h3>Assignments</h3>
                {courseAssignments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {courseAssignments.map((assignment) => {
                      const status = getAssignmentStatus(assignment)
                      const statusColor =
                        status === 'graded'
                          ? '#10b981'
                          : status === 'submitted'
                            ? '#3b82f6'
                            : status === 'overdue'
                              ? '#ef4444'
                              : '#f59e0b'
                      return (
                        <Link
                          key={assignment.id}
                          href={`/dashboard/student/assignments/${assignment.id}`}
                          style={{
                            display: 'block',
                            padding: '0.75rem 1rem',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: 'var(--text)',
                            transition: 'border-color 0.2s, box-shadow 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--teal-bright)'
                            e.currentTarget.style.boxShadow = '0 0 0 1px var(--teal-bright)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = ''
                            e.currentTarget.style.boxShadow = ''
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                                {assignment.title}
                              </div>
                              {assignment.description && (
                                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {assignment.description}
                                </p>
                              )}
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                                Due {formatDate(assignment.due_date)} · {assignment.max_points} pts
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: statusColor,
                                flexShrink: 0
                              }}
                            >
                              {getStatusLabel(status)}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No assignments for this course</p>
                )}
              </div>

              {/* Upcoming Topics */}
              {upcomingTopics.length > 0 && (
                <div className="course-info-card">
                  <h3>Upcoming Topics</h3>
                  <div>
                    {upcomingTopics.map((topic) => (
                      <div key={topic.id} className="topic-item">
                        <div className="topic-title">{topic.title}</div>
                        {topic.description && (
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            {topic.description}
                          </p>
                        )}
                        <div className="topic-date">{formatDate(topic.scheduled_date)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="course-detail-sidebar">
              {/* Professor */}
              {course.professor && (
                <div className="course-info-card">
                  <h3>Instructor</h3>
                  <div className="professor-card">
                    <div className="professor-avatar">
                      {getInitials(course.professor.first_name, course.professor.last_name)}
                    </div>
                    <div className="professor-info">
                      <h4>
                        {course.professor.first_name} {course.professor.last_name}
                      </h4>
                      <p>Professor</p>
                      {course.professor.email && (
                        <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          {course.professor.email}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          if (course.professor) {
                            setStartWithUserId(course.professor.id)
                            setOpenChat(true)
                          }
                        }}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem 1rem',
                          background: 'var(--teal-bright)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 500
                        }}
                      >
                        Message
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Enrolled Students */}
              <div className="course-info-card">
                <h3>Enrolled Students ({enrolledStudents.length})</h3>
                {enrolledStudents.length > 0 ? (
                  <div className="student-list">
                    {enrolledStudents.map((student) => (
                      <div key={student.id} className="student-item">
                        <div className="student-avatar">
                          {getInitials(student.first_name, student.last_name)}
                        </div>
                        <div className="student-info" style={{ flex: 1 }}>
                          <div className="student-name">
                            {student.first_name} {student.last_name}
                          </div>
                          {student.email && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {student.email}
                            </div>
                          )}
                        </div>
                        {student.id !== currentUserId && (
                          <button
                            onClick={() => {
                              setStartWithUserId(student.id)
                              setOpenChat(true)
                            }}
                            style={{
                              padding: '0.375rem 0.75rem',
                              background: 'var(--teal-bright)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Message
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>
            </div>
          </div>
          )}

          {activeCourseTab === 'materials' && (
            <div className="course-detail-content" style={{ maxWidth: '100%' }}>
              <div className="course-info-card" style={{ flex: 1 }}>
                <h3>Course materials</h3>
                {materialsLoading ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : courseMaterials.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {courseMaterials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setViewingMaterial({ url: getMaterialUrl(m.file_path), fileName: m.file_name })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          font: 'inherit',
                          color: 'var(--text)',
                          transition: 'border-color 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--teal-bright)'
                          e.currentTarget.style.boxShadow = '0 0 0 1px var(--teal-bright)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = ''
                          e.currentTarget.style.boxShadow = ''
                        }}
                      >
                        <span style={{ color: '#dc2626', flexShrink: 0 }}>
                          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                            <path fill="currentColor" d="M16 13H8m0 4h8m-4-4H8" />
                          </svg>
                        </span>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No materials for this course.</p>
                )}
              </div>
            </div>
          )}

          {activeCourseTab === 'announcements' && (
            <div className="course-detail-content" style={{ maxWidth: '100%' }}>
              <div className="course-info-card" style={{ flex: 1 }}>
                <h3>Announcements</h3>
                {announcementsLoading ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : announcements.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {announcements.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          padding: '1rem 1.25rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                        }}
                      >
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>{a.title}</div>
                        {a.content && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{a.content}</div>}
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Posted by {a.author ? [a.author.first_name, a.author.last_name].filter(Boolean).join(' ') : 'Professor'} · {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No announcements for this course yet.</p>
                )}
              </div>
            </div>
          )}

        </div>
      {viewingMaterial && (
        <DocumentViewer
          url={viewingMaterial.url}
          fileName={viewingMaterial.fileName}
          onClose={() => setViewingMaterial(null)}
        />
      )}
      </main>
      </div>
  )
}

export default function CourseDetailPage() {
  return (
    <ChatProvider>
      <CourseDetailPageContent />
    </ChatProvider>
  )
}
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
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  useEffect(() => {
    fetchCourseData()
    fetchAllCourses()
  }, [courseId])

  async function fetchAllCourses() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
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
        setAllCourses(coursesData.map((reg: any) => reg.course).filter(Boolean))
      }
    } catch (error) {
      console.error('Error fetching courses:', error)
    }
  }

  async function fetchCourseData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Fetch course details
      const { data: courseData } = await supabase
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
        .single()

      if (courseData) {
        setCourse(courseData)
      }

      // Fetch schedule
      const { data: scheduleData } = await supabase
        .from('course_schedules')
        .select('*')
        .eq('course_id', courseId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })

      if (scheduleData) {
        setSchedule(scheduleData)
      }

      // Fetch enrolled students using the RPC function
      const { data: studentsData, error: studentsError } = await supabase
        .rpc('get_enrolled_students', { p_course_id: courseId })

      if (studentsError) {
        console.error('Error fetching enrolled students:', studentsError)
        // Fallback: try direct query if RPC fails
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
      } else if (studentsData) {
        setEnrolledStudents(
          studentsData.map((s: any) => ({
            id: s.student_id,
            first_name: s.first_name,
            last_name: s.last_name,
            email: s.email
          }))
        )
      }

      // Fetch upcoming topics
      const today = new Date()
      const { data: topicsData } = await supabase
        .from('course_topics')
        .select('*')
        .eq('course_id', courseId)
        .gte('scheduled_date', today.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })
        .limit(5)

      if (topicsData) {
        setUpcomingTopics(topicsData)
      }
    } catch (error) {
      console.error('Error fetching course data:', error)
    } finally {
      setLoading(false)
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

  // Generate course color based on course ID (same function as dashboard)
  function getCourseColor(courseId: string) {
    const baseColors = [
      { primary: '#0892A5', secondary: '#0CA4A5' },
      { primary: '#06908F', secondary: '#0892A5' },
      { primary: '#0CA4A5', secondary: '#06908F' },
      { primary: '#0892A5', secondary: '#0CA4A5' },
      { primary: '#06908F', secondary: '#0CA4A5' },
      { primary: '#0CA4A5', secondary: '#0892A5' },
    ]
    
    const hash = courseId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    
    const colorIndex = Math.abs(hash) % baseColors.length
    return baseColors[colorIndex]
  }

  if (loading) {
    return (
      <div className="canvas-layout">
        <Sidebar courses={[]} />
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Loading course...</p>
          </div>
        </div>
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
          <h1 className="canvas-topbar-title">{course.code} - {course.name}</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {currentUserId && <Notifications userId={currentUserId} />}
            {currentUserId && <Chat userId={currentUserId} userRole={userRole} />}
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
                          setStartWithUserId(course.professor.id)
                          setOpenChat(true)
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
        </div>
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
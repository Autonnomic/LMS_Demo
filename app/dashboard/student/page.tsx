'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from './components/Sidebar'
import Notifications from './components/Notifications'
import Chat from './components/Chat'
import { ChatProvider } from './components/ChatContext'
import UserMenu from '../components/UserMenu'
import CalendarIcon from '../components/CalendarIcon'

interface Course {
  id: string
  code: string
  name: string
  description: string | null
  credits: number
  semester: string | null
  academic_year: string | null
  professor: {
    first_name: string | null
    last_name: string | null
  } | null
}

interface CourseAttendanceSummary {
  courseId: string
  courseCode: string
  courseName: string
  presentCount: number
  totalCount: number
  percentage: number
}

interface CourseGradeSummary {
  courseId: string
  courseCode: string
  courseName: string
  percentage: number
}

export default function StudentDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')
  const [attendanceSummaries, setAttendanceSummaries] = useState<CourseAttendanceSummary[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceError, setAttendanceError] = useState<string | null>(null)
  const [attendanceCalendarCourse, setAttendanceCalendarCourse] = useState<{ courseId: string; courseName: string; courseCode: string } | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [calendarAttendanceMap, setCalendarAttendanceMap] = useState<Record<string, string>>({})
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [gradeSummaries, setGradeSummaries] = useState<CourseGradeSummary[]>([])
  const [gradesLoading, setGradesLoading] = useState(false)
  const [overallGradePercent, setOverallGradePercent] = useState<number | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Fetch user profile and verify role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      // Verify user is a student, redirect if not
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
        setUserRole(profile.role as 'student' | 'professor')
      }

      // Fetch enrolled courses
      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses (
            id,
            code,
            name,
            description,
            credits,
            semester,
            academic_year,
            professor:user_profiles (
              first_name,
              last_name
            )
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'enrolled')

      const enrolledCourses = (coursesData || []).map((reg: any) => reg.course).filter(Boolean) as Course[]
      setCourses(enrolledCourses)

      // Fetch per-course attendance summary
      setAttendanceError(null)
      if (enrolledCourses.length > 0) {
        setAttendanceLoading(true)
        const summaries: CourseAttendanceSummary[] = []
        for (const course of enrolledCourses) {
          const { data: attData } = await supabase
            .from('attendance')
            .select('date, status')
            .eq('student_id', user.id)
            .eq('course_id', course.id)
          const totalCount = attData?.length ?? 0
          const presentCount = attData?.filter((r: { status: string }) => r.status === 'present').length ?? 0
          const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0
          summaries.push({
            courseId: course.id,
            courseCode: course.code,
            courseName: course.name,
            presentCount,
            totalCount,
            percentage,
          })
        }
        setAttendanceSummaries(summaries)
        setAttendanceLoading(false)
      } else {
        setAttendanceSummaries([])
      }

      // Fetch grades and compute course-wise and overall percentage
      setGradesLoading(true)
      const { data: gradesData } = await supabase
        .from('grades')
        .select('grade, max_grade, course:courses(id, code, name)')
        .eq('student_id', user.id)
      if (gradesData?.length) {
        const courseMap = new Map<string, { total: number; max: number; code: string; name: string }>()
        for (const g of gradesData as { grade: number; max_grade: number; course: { id: string; code: string; name: string } | null }[]) {
          if (!g.course) continue
          const id = g.course.id
          if (!courseMap.has(id)) courseMap.set(id, { total: 0, max: 0, code: g.course.code, name: g.course.name })
          const row = courseMap.get(id)!
          row.total += Number(g.grade)
          row.max += Number(g.max_grade || 100)
        }
        const summaries: CourseGradeSummary[] = []
        let grandTotal = 0
        let grandMax = 0
        courseMap.forEach((row, courseId) => {
          const pct = row.max > 0 ? (row.total / row.max) * 100 : 0
          summaries.push({ courseId, courseCode: row.code, courseName: row.name, percentage: Math.round(pct * 10) / 10 })
          grandTotal += row.total
          grandMax += row.max
        })
        setGradeSummaries(summaries)
        setOverallGradePercent(grandMax > 0 ? Math.round((grandTotal / grandMax) * 1000) / 10 : null)
      } else {
        setGradeSummaries([])
        setOverallGradePercent(null)
      }
      setGradesLoading(false)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setAttendanceError('Failed to load attendance.')
      setAttendanceLoading(false)
      setGradesLoading(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
    router.push('/')
    router.refresh()
  }

  const calendarDays: { day: number | null; dateStr: string | null }[] = (() => {
    if (!attendanceCalendarCourse) return []
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const first = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    const startWeekday = first.getDay()
    const days: { day: number | null; dateStr: string | null }[] = []
    for (let i = 0; i < startWeekday; i++) days.push({ day: null, dateStr: null })
    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = new Date(y, m, d).toISOString().slice(0, 10)
      days.push({ day: d, dateStr })
    }
    return days
  })()

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  useEffect(() => {
    if (!attendanceCalendarCourse || !userId) {
      setCalendarAttendanceMap({})
      return
    }
    let cancelled = false
    setCalendarLoading(true)
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const firstDay = new Date(y, m, 1).toISOString().slice(0, 10)
    const lastDay = new Date(y, m + 1, 0).toISOString().slice(0, 10)
    supabase
      .from('attendance')
      .select('date, status')
      .eq('student_id', userId)
      .eq('course_id', attendanceCalendarCourse.courseId)
      .gte('date', firstDay)
      .lte('date', lastDay)
      .then(({ data, error }) => {
        if (cancelled) return
        setCalendarLoading(false)
        if (error) {
          setCalendarAttendanceMap({})
          return
        }
        const map: Record<string, string> = {}
        ;(data || []).forEach((row: { date: string; status: string }) => {
          map[row.date] = row.status
        })
        setCalendarAttendanceMap(map)
      })
    return () => {
      cancelled = true
    }
  }, [attendanceCalendarCourse?.courseId, calendarMonth, userId])

  // Generate course color by index (no repeats within the grid, shared palette with calendar)
  function getCourseColorByIndex(index: number) {
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
    const colorIndex = index % palette.length
    const primary = palette[colorIndex]
    const secondary = palette[(colorIndex + 1) % palette.length]
    return { primary, secondary }
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <div className="canvas-topbar-brand">
                <span className="skeleton skeleton-text lg canvas-topbar-title" style={{ width: '120px' }} />
                <span className="skeleton canvas-topbar-logo-mobile" style={{ width: 48, height: 48, borderRadius: 8 }} />
              </div>
              <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                <div className="skeleton skeleton-avatar" style={{ width: 24, height: 24 }} />
                <div className="skeleton skeleton-avatar" style={{ width: 24, height: 24 }} />
                <div className="canvas-user-menu-wrapper">
                  <div className="canvas-user-menu canvas-user-menu-trigger" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="canvas-user-avatar skeleton" />
                    <div className="canvas-user-menu-name">
                      <div className="skeleton skeleton-text lg" style={{ width: '120px', marginBottom: '0.25rem' }} />
                      <div className="skeleton skeleton-text sm" style={{ width: '60px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="canvas-content-area">
              <div className="skeleton skeleton-text lg" style={{ width: '160px', marginBottom: '1.5rem' }} />
              <div className="canvas-courses-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton-card skeleton">
                    <div style={{ marginBottom: '1rem' }}>
                      <div className="skeleton skeleton-text sm" style={{ width: '40%', marginBottom: '0.5rem' }} />
                      <div className="skeleton skeleton-text lg" style={{ width: '70%' }} />
                    </div>
                    <div className="skeleton skeleton-text sm" style={{ width: '50%', marginBottom: '0.5rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '30%' }} />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        {/* Sidebar */}
        <Sidebar courses={courses.map(c => ({ id: c.id, code: c.code, name: c.name }))} />

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <div className="canvas-topbar-brand">
            <h1 className="canvas-topbar-title">Dashboard</h1>
            <img src="/logo.png" alt="Dashboard" className="canvas-topbar-logo-mobile" />
          </div>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
          </div>
        </div>

        <div className="canvas-content-area">
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
              My Courses
            </h2>
            {courses.length > 0 ? (
              <div className="canvas-courses-grid">
                {courses.map((course, index) => {
                  const courseColor = getCourseColorByIndex(index)
                  return (
                    <Link
                      key={course.id}
                      href={`/dashboard/student/courses/${course.id}`}
                      className="canvas-course-card"
                    >
                      <div 
                        className="canvas-course-card-header"
                        style={{
                          backgroundColor: courseColor.primary
                        }}
                      >
                        <div className="canvas-course-card-code">{course.code}</div>
                        <h3 className="canvas-course-card-title">{course.name}</h3>
                      </div>
                      <div className="canvas-course-card-body">
                        <div className="canvas-course-card-info">
                          <div className="canvas-course-card-info-item">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            {course.credits} Credits
                          </div>
                          {course.semester && (
                            <div className="canvas-course-card-info-item">
                              <CalendarIcon size={24} ariaHidden />
                              {course.semester} {course.academic_year}
                            </div>
                          )}
                          {course.professor && (
                            <div className="canvas-course-card-info-item">
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              Prof. {course.professor.first_name} {course.professor.last_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                <p>No courses enrolled yet</p>
              </div>
            )}
          </div>

          {(attendanceSummaries.length > 0 || gradeSummaries.length > 0) && (
            <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', maxWidth: 960 }}>
              {attendanceSummaries.length > 0 && (
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '0.75rem' }}>
                    Attendance
                  </h2>
                  {attendanceLoading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading attendance…</p>
                  ) : attendanceError ? (
                    <p style={{ color: '#b91c1c' }}>{attendanceError}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {attendanceSummaries.map((c) => (
                        <button
                          key={c.courseId}
                          type="button"
                          onClick={() => {
                            setAttendanceCalendarCourse({ courseId: c.courseId, courseName: c.courseName, courseCode: c.courseCode })
                            setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.9rem 1.1rem',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            cursor: 'pointer',
                            textAlign: 'left',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            font: 'inherit',
                            color: 'var(--text)',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
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
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.courseCode} — {c.courseName}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              {c.totalCount > 0 ? `${c.presentCount} / ${c.totalCount} days` : 'No attendance recorded'}
                            </div>
                          </div>
                          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: c.totalCount > 0 ? (c.percentage >= 75 ? '#10b981' : c.percentage >= 50 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)' }}>
                            {c.totalCount > 0 ? `${c.percentage}%` : '—'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '0.75rem' }}>
                  Grades
                </h2>
                {gradesLoading ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading grades…</p>
                ) : gradeSummaries.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {gradeSummaries.map((c) => (
                      <div
                        key={c.courseId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.9rem 1.1rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.courseCode} — {c.courseName}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Overall grade
                          </div>
                        </div>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: c.percentage >= 80 ? '#10b981' : c.percentage >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {c.percentage}%
                        </span>
                      </div>
                    ))}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.1rem',
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        marginTop: '0.25rem',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>Combined (all courses)</div>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: overallGradePercent != null ? (overallGradePercent >= 80 ? '#10b981' : overallGradePercent >= 60 ? '#f59e0b' : '#ef4444') : 'var(--text)' }}>
                        {overallGradePercent != null ? `${overallGradePercent}%` : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No grades yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {attendanceCalendarCourse && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Attendance calendar"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem',
            }}
            onClick={(e) => e.target === e.currentTarget && setAttendanceCalendarCourse(null)}
          >
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                maxWidth: 400,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                padding: '1.5rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--navy-dark)', margin: 0 }}>
                  {attendanceCalendarCourse.courseCode} — {attendanceCalendarCourse.courseName}
                </h3>
                <button
                  type="button"
                  onClick={() => setAttendanceCalendarCourse(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', fontSize: '1.25rem' }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                  ← Prev
                </button>
                <span style={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                  Next →
                </button>
              </div>
              {calendarLoading ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading…</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 8 }}>
                    {weekDays.map((w) => (
                      <div key={w} style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
                        {w}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {calendarDays.map((cell, i) => {
                      if (cell.day === null) return <div key={`empty-${i}`} />
                      const status = cell.dateStr ? calendarAttendanceMap[cell.dateStr] : null
                      const label = status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'late' ? 'L' : status === 'excused' ? 'E' : '—'
                      const bg = status === 'present' ? '#10b981' : status === 'absent' ? '#ef4444' : status === 'late' ? '#f59e0b' : status === 'excused' ? '#94a3b8' : 'var(--bg)'
                      const color = status ? 'white' : 'var(--text-muted)'
                      return (
                        <div
                          key={cell.dateStr ?? i}
                          style={{
                            aspectRatio: '1',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: bg,
                            color,
                            borderRadius: 6,
                          }}
                          title={cell.dateStr && status ? `${cell.dateStr}: ${status}` : cell.dateStr ?? ''}
                        >
                          <span>{cell.day}</span>
                          <span style={{ fontSize: '0.6rem', marginTop: 2 }}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#10b981', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Present</span>
                    <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#ef4444', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Absent</span>
                    <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#f59e0b', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Late</span>
                    <span><span style={{ display: 'inline-block', width: 14, height: 14, background: '#94a3b8', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} /> Excused</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      </div>
    </ChatProvider>
  )
}
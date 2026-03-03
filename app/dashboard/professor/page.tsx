'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Chat from '../student/components/Chat'
import Notifications from '../student/components/Notifications'
import { ChatProvider } from '../student/components/ChatContext'
import AutonnomicLogo from '../student/components/AutonnomicLogo'

interface Course {
  id: string
  code: string
  name: string
  description: string | null
  credits: number
  semester: string | null
  academic_year: string | null
  enrolled_students: number
}

export default function ProfessorDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('professor')

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
        .select('first_name, last_name, role, must_reset_password')
        .eq('id', user.id)
        .single()

      // Verify user is a professor, redirect if not
      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
        return
      }
      if (profile.must_reset_password) {
        router.replace('/reset-password')
        return
      }

      if (profile) {
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
        setUserInitials(
          (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P'
        )
        setUserId(user.id)
        setUserRole(profile.role as 'student' | 'professor')
      }

      // Fetch courses taught by this professor
      const { data: coursesData } = await supabase
        .from('courses')
        .select(`
          id,
          code,
          name,
          description,
          credits,
          semester,
          academic_year
        `)
        .eq('professor_id', user.id)
        .order('code', { ascending: true })

      if (coursesData?.length) {
        // Single query for all enrollment counts (avoids N+1)
        const courseIds = coursesData.map((c) => c.id)
        const { data: regs } = await supabase
          .from('course_registrations')
          .select('course_id')
          .in('course_id', courseIds)
          .eq('status', 'enrolled')
        const countByCourse: Record<string, number> = {}
        courseIds.forEach((id) => (countByCourse[id] = 0))
        regs?.forEach((r) => { countByCourse[r.course_id] = (countByCourse[r.course_id] || 0) + 1 })
        setCourses(
          coursesData.map((course) => ({
            ...course,
            enrolled_students: countByCourse[course.id] ?? 0
          }))
        )
      } else if (coursesData) {
        setCourses(
          coursesData.map((course) => ({
            ...course,
            enrolled_students: 0
          }))
        )
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

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
          <aside className="canvas-sidebar">
            <div className="canvas-sidebar-header">
              <div className="sidebar-logo-container">
                <div className="skeleton skeleton-avatar" />
              </div>
            </div>
            <nav className="canvas-sidebar-nav">
              <div className="canvas-nav-item">
                <div className="skeleton skeleton-avatar" />
                <span className="nav-text skeleton skeleton-text" style={{ width: '60%' }} />
              </div>
              <div className="canvas-nav-item">
                <div className="skeleton skeleton-avatar" />
                <span className="nav-text skeleton skeleton-text" style={{ width: '70%' }} />
              </div>
            </nav>
          </aside>

          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
              <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="skeleton skeleton-avatar" />
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
              <div className="skeleton-text lg skeleton" style={{ width: '160px', marginBottom: '1.5rem' }} />
              <div className="canvas-courses-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton-card skeleton">
                    <div style={{ marginBottom: '1rem' }}>
                      <div className="skeleton-text sm skeleton" style={{ width: '40%', marginBottom: '0.5rem' }} />
                      <div className="skeleton-text lg skeleton" style={{ width: '70%' }} />
                    </div>
                    <div className="skeleton-text sm skeleton" style={{ width: '50%', marginBottom: '0.5rem' }} />
                    <div className="skeleton-text sm skeleton" style={{ width: '30%' }} />
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
      <ProfessorDashboardContent
        courses={courses}
        userName={userName}
        userInitials={userInitials}
        userId={userId}
        userRole={userRole}
        onLogout={handleLogout}
        getCourseColor={getCourseColorByIndex}
      />
    </ChatProvider>
  )
}

function ProfessorDashboardContent({
  courses,
  userName,
  userInitials,
  userId,
  userRole,
  onLogout,
  getCourseColor,
}: {
  courses: Course[]
  userName: string
  userInitials: string
  userId: string
  userRole: 'student' | 'professor'
  onLogout: () => void
  getCourseColor: (index: number) => { primary: string; secondary: string }
}) {
  const pathname = usePathname()
  return (
    <div className="canvas-layout">
      <aside className="canvas-sidebar">
        <div className="canvas-sidebar-header">
          <div className="sidebar-logo-container">
            <AutonnomicLogo />
          </div>
        </div>
        <nav className="canvas-sidebar-nav">
          <Link href="/dashboard/professor" className={`canvas-nav-item ${pathname === '/dashboard/professor' ? 'active' : ''}`}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="nav-text">Dashboard</span>
          </Link>
          <Link href="/dashboard/professor/inbox" className={`canvas-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="nav-text">INBOX</span>
          </Link>
          <Link href="/dashboard/professor/ai-helper" className={`canvas-nav-item ${pathname === '/dashboard/professor/ai-helper' ? 'active' : ''}`}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="nav-text">AI helper</span>
          </Link>
        </nav>
        <div className="canvas-courses-section">
          <div className="canvas-courses-section-title">My Courses</div>
          <div className="courses-list expanded">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/professor/courses/${course.id}`}
                className="canvas-course-link"
              >
                <span className="course-code-small">{course.code}</span>
                <span className="course-name">{course.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      <nav className="canvas-sidebar-mobile-bottom" aria-label="Mobile navigation">
        <Link href="/dashboard/professor" className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor' ? 'active' : ''}`} aria-label="Dashboard">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        <Link href="/dashboard/professor/inbox" className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`} aria-label="Inbox">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </Link>
        <Link href="/dashboard/professor/ai-helper" className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/ai-helper' ? 'active' : ''}`} aria-label="AI helper">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </Link>
        <Link href="/dashboard/professor" className="canvas-mobile-nav-item" aria-label="My Courses">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </Link>
      </nav>

      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
            <div className="canvas-user-menu" onClick={onLogout}>
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
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
              My Courses
            </h2>
            {courses.length > 0 ? (
              <div className="canvas-courses-grid">
                {courses.map((course, index) => {
                  const colors = getCourseColor(index)
                  return (
                    <Link
                      key={course.id}
                      href={`/dashboard/professor/courses/${course.id}`}
                      className="canvas-course-card"
                    >
                      <div
                        className="canvas-course-card-header"
                        style={{
                          backgroundColor: colors.primary,
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
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {course.semester} {course.academic_year}
                            </div>
                          )}
                          <div className="canvas-course-card-info-item">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {course.enrolled_students} Students
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                <p>No courses assigned yet</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
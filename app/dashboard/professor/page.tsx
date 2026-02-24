'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Chat from '../student/components/Chat'
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
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      // Verify user is a professor, redirect if not
      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
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

      if (coursesData) {
        // Get enrollment count for each course
        const coursesWithEnrollment = await Promise.all(
          coursesData.map(async (course) => {
            const { count } = await supabase
              .from('course_registrations')
              .select('*', { count: 'exact', head: true })
              .eq('course_id', course.id)
              .eq('status', 'enrolled')
            
            return {
              ...course,
              enrolled_students: count || 0
            }
          })
        )
        setCourses(coursesWithEnrollment)
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

  if (loading) {
    return (
      <div className="canvas-layout">
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        {/* Sidebar */}
        <aside className="canvas-sidebar">
        <div className="canvas-sidebar-header">
          <div className="sidebar-logo-container">
            <AutonnomicLogo />
          </div>
        </div>
        <nav className="canvas-sidebar-nav">
          <Link href="/dashboard/professor" className="canvas-nav-item active">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="nav-text">Dashboard</span>
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

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">Professor Dashboard</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Chat userId={userId} userRole={userRole} />}
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
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
              My Courses
            </h2>
            {courses.length > 0 ? (
              <div className="canvas-courses-grid">
                {courses.map((course) => (
                  <Link
                    key={course.id}
                    href={`/dashboard/professor/courses/${course.id}`}
                    className="canvas-course-card"
                  >
                    <div className="canvas-course-card-header">
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
                ))}
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
    </ChatProvider>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from './components/Sidebar'
import Notifications from './components/Notifications'
import Chat from './components/Chat'
import { ChatProvider } from './components/ChatContext'

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

export default function StudentDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')

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

      if (coursesData) {
        setCourses(coursesData.map((reg: any) => reg.course).filter(Boolean))
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

  // Generate course color based on course ID
  function getCourseColor(courseId: string, index: number) {
    // Base colors from the palette
    const baseColors = [
      { primary: '#0892A5', secondary: '#0CA4A5' }, // Teal bright to medium
      { primary: '#06908F', secondary: '#0892A5' }, // Teal dark to bright
      { primary: '#0CA4A5', secondary: '#06908F' }, // Teal medium to dark
      { primary: '#0892A5', secondary: '#0CA4A5' }, // Teal bright to medium (variation)
      { primary: '#06908F', secondary: '#0CA4A5' }, // Teal dark to medium
      { primary: '#0CA4A5', secondary: '#0892A5' }, // Teal medium to bright
    ]
    
    // Use course ID hash for consistent color assignment
    const hash = courseId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    
    const colorIndex = Math.abs(hash) % baseColors.length
    return baseColors[colorIndex]
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <div className="canvas-main-content">
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <p>Loading dashboard...</p>
            </div>
          </div>
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
          <h1 className="canvas-topbar-title">Dashboard</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
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
                {courses.map((course, index) => {
                  const courseColor = getCourseColor(course.id, index)
                  return (
                    <Link
                      key={course.id}
                      href={`/dashboard/student/courses/${course.id}`}
                      className="canvas-course-card"
                    >
                      <div 
                        className="canvas-course-card-header"
                        style={{
                          background: `linear-gradient(135deg, ${courseColor.primary} 0%, ${courseColor.secondary} 100%)`
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
        </div>
      </main>
      </div>
    </ChatProvider>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Chat from '../student/components/Chat'
import Notifications from '../student/components/Notifications'
import { ChatProvider } from '../student/components/ChatContext'
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

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role, must_reset_password')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
        return
      }
      if (profile.must_reset_password) {
        router.replace('/reset-password')
        return
      }

      const firstName = profile.first_name || ''
      const lastName = profile.last_name || ''
      setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
      setUserInitials(
        (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P'
      )
      setUserId(user.id)
      setUserRole(profile.role as 'student' | 'professor')

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

  function getCourseColorByIndex(index: number) {
    const palette = [
      '#0892A5',
      '#2563EB',
      '#10B981',
      '#F97316',
      '#EC4899',
      '#8B5CF6',
      '#F59E0B',
      '#EF4444',
    ]
    const colorIndex = index % palette.length
    const primary = palette[colorIndex]
    const secondary = palette[(colorIndex + 1) % palette.length]
    return { primary, secondary }
  }

  if (loading) {
    return (
      <ChatProvider>
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <div className="canvas-topbar-brand">
              <span className="skeleton skeleton-text lg canvas-topbar-title" style={{ width: '120px' }} />
              <span className="skeleton canvas-topbar-logo-mobile" style={{ width: 48, height: 48, borderRadius: 8 }} />
            </div>
            <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="skeleton skeleton-avatar" />
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
  return (
    <main className="canvas-main-content">
      <div className="canvas-topbar">
        <div className="canvas-topbar-brand">
          <h1 className="canvas-topbar-title">My Courses</h1>
          <img src="/logo.png" alt="" className="canvas-topbar-logo-mobile" />
        </div>
        <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {userId && <Notifications userId={userId} />}
          {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
          <UserMenu userName={userName} userInitials={userInitials} onLogout={onLogout} />
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
                            <CalendarIcon size={24} ariaHidden />
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
  )
}
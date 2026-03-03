'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Chat from '../../student/components/Chat'
import Notifications from '../../student/components/Notifications'
import { ChatProvider } from '../../student/components/ChatContext'
import AutonnomicLogo from '../../student/components/AutonnomicLogo'
import AiHelperChat from '../../student/components/AiHelperChat'

interface Course {
  id: string
  code: string
  name: string
}

export default function ProfessorAiHelperPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('professor')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
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
      setUserInitials((firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P')
      setUserId(user.id)
      setUserRole('professor')

      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, code, name')
        .eq('professor_id', user.id)
        .order('code')
      setCourses(coursesData || [])
    } catch (e) {
      console.error('Professor AI helper page error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <aside className="canvas-sidebar">
            <div className="canvas-sidebar-header">
              <div className="sidebar-logo-container">
                <AutonnomicLogo />
              </div>
            </div>
            <nav className="canvas-sidebar-nav">
              <div className="canvas-nav-item" style={{ opacity: 0.6 }}>Dashboard</div>
              <div className="canvas-nav-item" style={{ opacity: 0.6 }}>INBOX</div>
              <div className="canvas-nav-item" style={{ opacity: 0.6 }}>AI helper</div>
            </nav>
          </aside>
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <span className="canvas-topbar-title">AI helper</span>
            </div>
            <div className="canvas-content-area">
              <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
              <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <aside className="canvas-sidebar">
          <div className="canvas-sidebar-header">
            <div className="sidebar-logo-container">
              <AutonnomicLogo />
            </div>
          </div>
          <nav className="canvas-sidebar-nav">
            <Link href="/dashboard/professor" className="canvas-nav-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="nav-text">Dashboard</span>
            </Link>
            <Link href="/dashboard/professor/inbox" className="canvas-nav-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="nav-text">INBOX</span>
            </Link>
            <Link href="/dashboard/professor/ai-helper" className="canvas-nav-item active">
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
          <Link href="/dashboard/professor" className="canvas-mobile-nav-item" aria-label="Dashboard">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Link>
          <Link href="/dashboard/professor/inbox" className="canvas-mobile-nav-item" aria-label="Inbox">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </Link>
          <Link href="/dashboard/professor/ai-helper" className="canvas-mobile-nav-item active" aria-label="AI helper">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </Link>
        </nav>

        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
            <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {userId && <Notifications userId={userId} />}
              {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
              <div
                className="canvas-user-menu"
                onClick={() => {
                  supabase.auth.signOut()
                  router.push('/')
                  router.refresh()
                }}
              >
                <div className="canvas-user-avatar">{userInitials}</div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{userName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logout</div>
                </div>
              </div>
            </div>
          </div>
          <div className="canvas-content-area" style={{ padding: 0, overflow: 'hidden' }}>
            <AiHelperChat userId={userId} />
          </div>
        </main>
      </div>
    </ChatProvider>
  )
}

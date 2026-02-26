'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../../student/components/AutonnomicLogo'
import InboxPage from '../../student/components/InboxPage'

export default function ProfessorInboxPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'student' | 'professor'>('professor')
  const [courses, setCourses] = useState<{ id: string; code: string; name: string }[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profile } = await supabase.from('user_profiles').select('role, must_reset_password').eq('id', user.id).single()
      if (!profile || profile.role !== 'professor') {
        router.replace('/dashboard')
        return
      }
      if (profile.must_reset_password) {
        router.replace('/reset-password')
        return
      }
      setUserId(user.id)
      setUserRole((profile.role as 'student' | 'professor') || 'professor')
      const { data: coursesData } = await supabase.from('courses').select('id, code, name').eq('professor_id', user.id).order('code', { ascending: true })
      setCourses(coursesData || [])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <div className="canvas-layout">
        <aside className="canvas-sidebar">
          <div className="canvas-sidebar-header">
            <div className="sidebar-logo-container">
              <AutonnomicLogo />
            </div>
          </div>
        </aside>
        <main className="canvas-main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </main>
      </div>
    )
  }

  if (!userId) return null

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
        </nav>
        <div className="canvas-courses-section">
          <div className="canvas-courses-section-title">My Courses</div>
          <div className="courses-list expanded">
            {courses.map((course) => (
              <Link key={course.id} href={`/dashboard/professor/courses/${course.id}`} className="canvas-course-link">
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
        <Link href="/dashboard/professor" className="canvas-mobile-nav-item" aria-label="My Courses">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </Link>
      </nav>

      <main className="canvas-main-content" style={{ padding: 0, overflow: 'hidden', height: '100vh' }}>
        <InboxPage
          userId={userId}
          userRole={userRole}
          inboxHref="/dashboard/professor/inbox"
          backHref="/dashboard/professor"
          backLabel="Dashboard"
          showTopBarLogo
        />
      </main>
    </div>
  )
}

'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import AutonnomicLogo from '../student/components/AutonnomicLogo'
import { supabase } from '@/lib/supabase'

interface Course {
  id: string
  code: string
  name: string
}

interface ProfessorSidebarProps {
  courses: Course[]
  unreadInboxCount?: number
}

export default function ProfessorSidebar({ courses, unreadInboxCount = 0 }: ProfessorSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="canvas-sidebar">
      <div className="canvas-sidebar-header">
        <div className="sidebar-logo-container">
          <AutonnomicLogo />
        </div>
      </div>
      <nav className="canvas-sidebar-nav">
        <Link
          href="/dashboard/professor"
          className={`canvas-nav-item ${pathname === '/dashboard/professor' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="nav-text">Dashboard</span>
        </Link>
        <Link
          href="/dashboard/professor/inbox"
          className={`canvas-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="nav-text" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            INBOX
            {pathname !== '/dashboard/professor/inbox' && unreadInboxCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -14,
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 0 2px var(--canvas-sidebar-bg, #0f172a)',
                }}
              >
                {unreadInboxCount > 99 ? '99+' : unreadInboxCount}
              </span>
            )}
          </span>
        </Link>
        <Link
          href="/dashboard/ai-helper"
          className={`canvas-nav-item ${pathname === '/dashboard/ai-helper' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="nav-text">AI helper</span>
        </Link>
        <Link
          href="/dashboard/professor/profile"
          className={`canvas-nav-item ${pathname === '/dashboard/professor/profile' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="nav-text">Profile</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="canvas-nav-item canvas-nav-item-logout"
          style={{ marginTop: 'auto', border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="nav-text">Logout</span>
        </button>
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
  )
}

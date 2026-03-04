'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'

interface SidebarCourse {
  id: string
  code: string
  name: string
}

export default function ProfessorLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<SidebarCourse[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          if (!cancelled && !user) router.replace('/')
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, must_reset_password')
          .eq('id', user.id)
          .single()

        if (!profile || profile.role !== 'professor' || cancelled) {
          if (!cancelled) router.replace('/dashboard')
          return
        }

        if (profile.must_reset_password && !cancelled) {
          router.replace('/reset-password')
          return
        }

        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('professor_id', user.id)
          .order('code', { ascending: true })

        if (!cancelled && coursesData) {
          setCourses(coursesData)
        }

        // Load unread inbox message count for this professor
        try {
          const { data: convs } = await supabase
            .from('conversations')
            .select('id')
            .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)

          if (!cancelled && convs && convs.length > 0) {
            let totalUnread = 0
            for (const conv of convs as { id: string }[]) {
              const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id)
                .eq('read', false)
                .neq('sender_id', user.id)
              totalUnread += count || 0
            }
            if (!cancelled) {
              setUnreadCount(totalUnread)
            }
          }
        } catch (e) {
          console.error('Error loading unread inbox count:', e)
        }
      } catch (error) {
        console.error('Error loading professor layout:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  // When the user is on the Inbox page, hide the badge and reset the local count
  // so that it disappears as soon as they click into Inbox.
  useEffect(() => {
    if (pathname === '/dashboard/professor/inbox') {
      setUnreadCount(0)
    }
  }, [pathname])

  if (loading) {
    return (
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
        {children}
      </div>
    )
  }

  return (
    <div className="canvas-layout">
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="nav-text">Dashboard</span>
          </Link>
          <Link
            href="/dashboard/professor/inbox"
            className={`canvas-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span
              className="nav-text"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            >
              INBOX
              {pathname !== '/dashboard/professor/inbox' && unreadCount > 0 && (
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
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          </Link>
          <Link
            href="/dashboard/professor/ai-helper"
            className={`canvas-nav-item ${pathname === '/dashboard/professor/ai-helper' ? 'active' : ''}`}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
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
        <Link
          href="/dashboard/professor"
          className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor' ? 'active' : ''}`}
          aria-label="Dashboard"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </Link>
        <Link
          href="/dashboard/professor/inbox"
          className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`}
          aria-label="Inbox"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </Link>
        <Link
          href="/dashboard/professor/ai-helper"
          className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/ai-helper' ? 'active' : ''}`}
          aria-label="AI helper"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </Link>
        <Link
          href="/dashboard/professor"
          className="canvas-mobile-nav-item"
          aria-label="My Courses"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </Link>
      </nav>

      {children}
    </div>
  )
}


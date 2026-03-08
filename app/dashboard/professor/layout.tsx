'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'
import CalendarIcon from '../components/CalendarIcon'
import { ProfessorMobileBottomBar } from '../components/ProfessorMobileBottomBar'

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
              <AutonnomicLogo />
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
            href="/dashboard/ai-helper"
            className={`canvas-nav-item ${pathname === '/dashboard/ai-helper' ? 'active' : ''}`}
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
            href="/dashboard/professor/calendar"
            className={`canvas-nav-item ${pathname === '/dashboard/professor/calendar' ? 'active' : ''}`}
          >
            <CalendarIcon size={24} ariaHidden />
            <span className="nav-text">Calendar</span>
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
          <Link
            href="/dashboard/settings"
            className={`canvas-nav-item ${pathname === '/dashboard/settings' ? 'active' : ''}`}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="nav-text">Settings</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              const { logout } = await import('@/lib/auth'); await logout()
              router.push('/')
              router.refresh()
            }}
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

      <ProfessorMobileBottomBar pathname={pathname} />

      {children}
    </div>
  )
}


'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../student/components/Sidebar'
import { ChatProvider } from '../student/components/ChatContext'
import ProfessorSidebar from '../components/ProfessorSidebar'
import { ProfessorMobileBottomBar } from '../components/ProfessorMobileBottomBar'
import UserMenu from '../components/UserMenu'
import AutonnomicLogo from '../student/components/AutonnomicLogo'

type Role = 'student' | 'professor' | 'admin'

interface SidebarCourse {
  id: string
  code: string
  name: string
}

export default function SettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<Role | null>(null)
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [courses, setCourses] = useState<SidebarCourse[]>([])
  const [unreadInboxCount, setUnreadInboxCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) {
        if (!cancelled && !user) router.replace('/')
        return
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()
      if (!profile || cancelled) {
        if (!cancelled) router.replace('/dashboard')
        return
      }
      const r = profile.role as Role
      if ((r !== 'student' && r !== 'professor' && r !== 'admin') || cancelled) {
        if (!cancelled) router.replace('/dashboard')
        return
      }
      const first = (profile.first_name || '').trim()
      const last = (profile.last_name || '').trim()
      if (!cancelled) {
        setRole(r)
        setUserName([first, last].filter(Boolean).join(' ') || 'User')
        setUserInitials((first.charAt(0) + last.charAt(0)).toUpperCase() || 'U')
      }
      if (r === 'student' && !cancelled) {
        const { data: regs } = await supabase
          .from('course_registrations')
          .select('course:courses ( id, code, name )')
          .eq('student_id', user.id)
          .eq('status', 'enrolled')
        const raw = (regs || []) as unknown as { course?: SidebarCourse | null }[]
        const list = raw.map((x) => x.course).filter((c): c is SidebarCourse => Boolean(c))
        if (!cancelled) setCourses(list)
      }
      if (r === 'professor' && !cancelled) {
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('professor_id', user.id)
          .order('code', { ascending: true })
        if (!cancelled && coursesData) setCourses(coursesData)
        try {
          const { data: convs } = await supabase
            .from('conversations')
            .select('id')
            .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
          if (convs?.length && !cancelled) {
            let total = 0
            for (const conv of convs as { id: string }[]) {
              const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id)
                .eq('read', false)
                .neq('sender_id', user.id)
              total += count || 0
            }
            if (!cancelled) setUnreadInboxCount(total)
          }
        } catch (_) {}
      }
      if (!cancelled) setLoading(false)
    }
    check()
    return () => { cancelled = true }
  }, [router])

  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
    router.push('/')
    router.refresh()
  }

  const dashboardHref =
    role === 'admin' ? '/dashboard/admin' : role === 'professor' ? '/dashboard/professor' : '/dashboard/student'

  const adminBase = '/dashboard/admin'
  const adminNavItems = [
    { href: `${adminBase}/users`, label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { href: `${adminBase}/courses`, label: 'Courses', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { href: `${adminBase}/signup-emails`, label: 'Signup emails', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { href: `${adminBase}/profile`, label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ]

  if (loading) {
    return (
      <div className="canvas-layout" style={{ minHeight: '100vh' }}>
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
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <Link href={dashboardHref} className="canvas-topbar-title" style={{ textDecoration: 'none', color: 'inherit' }}>
              ← Dashboard
            </Link>
          </div>
          <div className="canvas-content-area">
            <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
            <div className="skeleton-card skeleton" style={{ padding: '2rem', maxWidth: 480 }} />
          </div>
        </main>
      </div>
    )
  }

  const mainContent = (
    <>
      <div className="canvas-topbar">
        <Link href={dashboardHref} className="canvas-topbar-title" style={{ textDecoration: 'none', color: 'inherit' }}>
          ← Dashboard
        </Link>
        <div className="canvas-topbar-actions">
          <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
        </div>
      </div>
      <div className="canvas-content-area">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1.5rem' }}>
          Settings
        </h1>
        <div
          style={{
            maxWidth: 480,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '1.5rem 2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            Manage your account preferences here.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link
              href="/reset-password"
              style={{
                fontSize: '0.875rem',
                color: 'var(--accent)',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Change password →
            </Link>
          </div>
        </div>
      </div>
    </>
  )

  if (role === 'student') {
    return (
      <ChatProvider>
        <div className="canvas-layout" style={{ minHeight: '100vh' }}>
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            {mainContent}
          </main>
        </div>
      </ChatProvider>
    )
  }

  if (role === 'admin') {
    return (
      <div className="canvas-layout" style={{ minHeight: '100vh' }}>
        <aside className="canvas-sidebar">
          <div className="canvas-sidebar-header">
            <div className="sidebar-logo-container">
              <AutonnomicLogo />
            </div>
          </div>
          <nav className="canvas-sidebar-nav">
            {adminNavItems.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`canvas-nav-item ${pathname === href ? 'active' : ''}`}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                <span className="nav-text">{label}</span>
              </Link>
            ))}
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
        </aside>
        <main className="canvas-main-content">
          {mainContent}
        </main>
      </div>
    )
  }

  return (
    <div className="canvas-layout" style={{ minHeight: '100vh' }}>
      <ProfessorSidebar courses={courses} unreadInboxCount={unreadInboxCount} />
      <ProfessorMobileBottomBar pathname={pathname} />
      <main className="canvas-main-content">
        {mainContent}
      </main>
    </div>
  )
}

'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'
import UserMenu from '../components/UserMenu'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('A')

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
      if (!profile || profile.role !== 'admin' || cancelled) {
        if (!cancelled) router.replace('/dashboard')
        return
      }
      const first = (profile.first_name || '').trim()
      const last = (profile.last_name || '').trim()
      if (!cancelled) {
        setUserName([first, last].filter(Boolean).join(' ') || 'Admin')
        setUserInitials((first.charAt(0) + last.charAt(0)).toUpperCase() || 'A')
      }
      if (!cancelled) setLoading(false)
    }
    check()
    return () => { cancelled = true }
  }, [router])

  if (loading) {
    return (
      <div className="canvas-layout">
        <main className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Loading...</p>
          </div>
        </main>
      </div>
    )
  }

  const base = '/dashboard/admin'
  const navItems = [
    { href: `${base}/users`, label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { href: `${base}/courses`, label: 'Courses', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { href: `${base}/enrollments`, label: 'Enrollments', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: `${base}/signup-emails`, label: 'Signup emails', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { href: `${base}/profile`, label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
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
          {navItems.map(({ href, label, icon }) => (
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
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">Admin Dashboard</h1>
          <div className="canvas-topbar-actions">
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
          </div>
        </div>
        <div className="canvas-content-area">
          {children}
        </div>
      </main>
    </div>
  )
}

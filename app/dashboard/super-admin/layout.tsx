'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'
import UserMenu from '../components/UserMenu'

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('SA')

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
      if (!profile || profile.role !== 'super_admin' || cancelled) {
        if (!cancelled) router.replace('/dashboard')
        return
      }
      const first = (profile.first_name || '').trim()
      const last = (profile.last_name || '').trim()
      if (!cancelled) {
        setUserName([first, last].filter(Boolean).join(' ') || 'Super Admin')
        setUserInitials((first.charAt(0) + last.charAt(0)).toUpperCase() || 'SA')
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

  const base = '/dashboard/super-admin'
  const navItems = [
    { href: `${base}/colleges`, label: 'Colleges', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ]

  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
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
              title={label}
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
          <h1 className="canvas-topbar-title">Super Admin</h1>
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

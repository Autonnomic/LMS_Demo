'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import AutonnomicLogo from '../student/components/AutonnomicLogo'

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="canvas-sidebar">
      <div className="canvas-sidebar-header">
        <div className="sidebar-logo-container">
          <AutonnomicLogo />
        </div>
      </div>
      <nav className="canvas-sidebar-nav">
        <Link
          href="/dashboard/admin"
          className={`canvas-nav-item ${pathname === '/dashboard/admin' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
          </svg>
          <span className="nav-text">Admin Dashboard</span>
        </Link>
        <Link
          href="/dashboard/admin/profile"
          className={`canvas-nav-item ${pathname === '/dashboard/admin/profile' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="nav-text">Profile</span>
        </Link>
      </nav>
    </aside>
  )
}

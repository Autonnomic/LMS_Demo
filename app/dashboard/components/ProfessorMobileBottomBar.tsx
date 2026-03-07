'use client'

import { memo } from 'react'
import Link from 'next/link'
import CalendarIcon from './CalendarIcon'

function ProfessorMobileBottomBarInner({ pathname }: { pathname: string }) {
  return (
    <nav className="canvas-sidebar-mobile-bottom" aria-label="Mobile navigation">
      <Link
        href="/dashboard/professor"
        className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor' ? 'active' : ''}`}
        aria-label="Dashboard"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </Link>
      <Link
        href="/dashboard/professor/inbox"
        className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/inbox' ? 'active' : ''}`}
        aria-label="Inbox"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </Link>
      <Link
        href="/dashboard/ai-helper"
        className={`canvas-mobile-nav-item ${pathname === '/dashboard/ai-helper' ? 'active' : ''}`}
        aria-label="AI helper"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </Link>
      <Link
        href="/dashboard/professor/calendar"
        className={`canvas-mobile-nav-item ${pathname === '/dashboard/professor/calendar' ? 'active' : ''}`}
        aria-label="Calendar"
      >
        <CalendarIcon size={24} ariaHidden />
      </Link>
    </nav>
  )
}

export const ProfessorMobileBottomBar = memo(ProfessorMobileBottomBarInner)

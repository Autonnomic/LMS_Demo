'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface UserMenuProps {
  userName: string
  userInitials: string
  onLogout: () => void
}

export default function UserMenu({ userName, userInitials, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className={`canvas-user-menu-wrapper ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="canvas-user-menu canvas-user-menu-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        aria-expanded={open}
        aria-haspopup="true"
        style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: 8 }}
      >
        <div className="canvas-user-avatar">{userInitials}</div>
        <div className="canvas-user-menu-name">
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
            {userName}
          </div>
        </div>
      </button>
      <div className="canvas-user-menu-dropdown" aria-hidden={!open}>
        <Link href="/dashboard/profile" className="canvas-user-menu-dropdown-item">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Profile
        </Link>
        <Link href="/dashboard/settings" className="canvas-user-menu-dropdown-item">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </Link>
        <button
          type="button"
          className="canvas-user-menu-dropdown-item canvas-user-menu-dropdown-item-logout"
          onClick={onLogout}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  )
}

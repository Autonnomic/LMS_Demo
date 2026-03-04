'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      setLoading(false)
    }
    check()
  }, [router])

  if (loading) {
    return (
      <div className="canvas-layout" style={{ minHeight: '100vh' }}>
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <Link href="/dashboard" className="canvas-topbar-title" style={{ textDecoration: 'none', color: 'inherit' }}>
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

  return (
    <div className="canvas-layout" style={{ minHeight: '100vh' }}>
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <Link href="/dashboard" className="canvas-topbar-title" style={{ textDecoration: 'none', color: 'inherit' }}>
            ← Dashboard
          </Link>
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
      </main>
    </div>
  )
}

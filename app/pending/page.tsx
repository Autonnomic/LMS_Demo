'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PendingApprovalPage() {
  const router = useRouter()
  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
    router.push('/')
    router.refresh()
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Account pending</h1>
        <p className="subtitle">
          Your account is awaiting approval. An admin will assign your role and you&apos;ll receive an email with a login link once you&apos;re approved.
        </p>
        <button type="button" onClick={handleLogout} className="btn-secondary" style={{ width: '100%' }}>
          Log out
        </button>
      </div>
    </main>
  )
}

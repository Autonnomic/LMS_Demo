'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function StudentDashboard() {
  const router = useRouter()
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Student dashboard</h1>
        <p className="subtitle">Welcome. View your courses and assignments here.</p>
        <button type="button" onClick={handleLogout} className="btn-secondary" style={{ width: '100%' }}>
          Log out
        </button>
      </div>
    </main>
  )
}

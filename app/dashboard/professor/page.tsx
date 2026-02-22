'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ProfessorDashboard() {
  const router = useRouter()
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Professor dashboard</h1>
        <p className="subtitle">Manage courses, assignments, and student grades.</p>
        <button type="button" onClick={handleLogout} className="btn-secondary" style={{ width: '100%' }}>
          Log out
        </button>
      </div>
    </main>
  )
}

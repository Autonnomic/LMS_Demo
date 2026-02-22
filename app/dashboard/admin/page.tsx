'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: 'student' | 'professor' | 'admin' | null
  created_at: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error: e } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role, created_at')
        .order('created_at', { ascending: false })
      if (e) {
        setError(e.message)
        setLoading(false)
        return
      }
      setProfiles((data as Profile[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleAssign(userId: string, role: 'student' | 'professor' | 'admin') {
    setAssigning(userId)
    setError(null)
    const res = await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Failed to assign role')
      setAssigning(null)
      return
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, role } : p))
    )
    setAssigning(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const pending = profiles.filter((p) => p.role == null)
  const approved = profiles.filter((p) => p.role != null)

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <h1>Admin dashboard</h1>
        <p className="subtitle">
          {pending.length > 0
            ? `You have ${pending.length} pending signup${pending.length === 1 ? '' : 's'}. Assign a role below.`
            : 'Manage users and roles.'}
        </p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="subtitle">Loading…</p>
        ) : (
          <>
            {pending.length > 0 && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  Pending signups
                </h2>
                <ul style={{ listStyle: 'none' }} className="pending-list">
                  {pending.map((p) => (
                    <li key={p.id} className="pending-item">
                      <div className="pending-info">
                        <span className="pending-email">{p.email || p.id}</span>
                        {p.first_name && (
                          <span className="pending-name">
                            {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                      <div className="pending-actions">
                        <select
                          id={`role-${p.id}`}
                          className="pending-select"
                          defaultValue="student"
                        >
                          <option value="student">Student</option>
                          <option value="professor">Professor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ marginTop: 0, padding: '0.5rem 1rem' }}
                          disabled={assigning === p.id}
                          onClick={() => {
                            const sel = document.getElementById(`role-${p.id}`) as HTMLSelectElement
                            handleAssign(p.id, (sel?.value as 'student' | 'professor' | 'admin') || 'student')
                          }}
                        >
                          {assigning === p.id ? 'Assigning…' : 'Assign role'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {approved.length > 0 && (
              <section>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  All users
                </h2>
                <ul style={{ listStyle: 'none' }} className="pending-list">
                  {approved.map((p) => (
                    <li key={p.id} className="pending-item">
                      <div className="pending-info">
                        <span className="pending-email">{p.email || p.id}</span>
                        <span className="pending-role">{p.role}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="btn-secondary"
          style={{ width: '100%', marginTop: '1.5rem' }}
        >
          Log out
        </button>
      </div>
    </main>
  )
}

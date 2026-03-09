'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../types'

export default function AdminStudentsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') return

    const { data: profilesData } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, role, roll_number, created_at')
      .order('created_at', { ascending: false })
    if (profilesData) {
      setProfiles(profilesData as Profile[])
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchData()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleAssignRole(userId: string, role: 'student' | 'professor' | 'admin') {
    setAssigning(userId)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
    const res = await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Failed to assign role')
      setAssigning(null)
      return
    }
    setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, role } : p)))
    setAssigning(null)
  }

  const students = profiles.filter((p) => p.role === 'student')
  const searchLower = searchQuery.trim().toLowerCase()
  const filteredStudents =
    searchLower === ''
      ? students
      : students.filter((p) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ').toLowerCase()
          const email = (p.email ?? '').toLowerCase()
          const roll = (p.roll_number ?? '').toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower) || roll.includes(searchLower)
        })

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
        Students
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Only emails in the &quot;Signup emails&quot; list can create an account. Students sign up on their own with an allowed email.
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {students.length > 0 ? (
        <section>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
            All students ({filteredStudents.length}{filteredStudents.length !== students.length ? ` of ${students.length}` : ''})
          </h3>
          <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search by name, email or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search students"
              style={{ width: '100%' }}
            />
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Roll no.</th>
                  <th>Role</th>
                  <th>Change role</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((p) => (
                  <tr key={p.id}>
                    <td>{p.email || p.id}</td>
                    <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '-'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {p.roll_number ?? '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        backgroundColor: '#06908F',
                        color: 'white'
                      }}>
                        {p.role}
                      </span>
                    </td>
                    <td>
                      <select
                        id={`role-${p.id}`}
                        className="form-control"
                        defaultValue={p.role ?? 'student'}
                        style={{ width: 'auto', display: 'inline-block', marginRight: '0.5rem' }}
                      >
                        <option value="student">Student</option>
                        <option value="professor">Professor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '0.35rem 0.75rem' }}
                        disabled={assigning === p.id}
                        onClick={() => {
                          const sel = document.getElementById(`role-${p.id}`) as HTMLSelectElement
                          const newRole = (sel?.value as 'student' | 'professor' | 'admin') || 'student'
                          if (newRole !== p.role) handleAssignRole(p.id, newRole)
                        }}
                      >
                        {assigning === p.id ? 'Updating…' : 'Update'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No students yet.</p>
      )}
    </div>
  )
}

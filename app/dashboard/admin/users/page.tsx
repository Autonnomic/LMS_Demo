'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../types'

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [professors, setProfessors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingProfessor, setCreatingProfessor] = useState(false)
  const [professorEmail, setProfessorEmail] = useState('')
  const [professorTempPassword, setProfessorTempPassword] = useState('')
  const [professorFirstName, setProfessorFirstName] = useState('')
  const [professorLastName, setProfessorLastName] = useState('')
  const [userSearchQuery, setUserSearchQuery] = useState('')

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
      setProfessors(profilesData.filter((p: { role: string }) => p.role === 'professor') as Profile[])
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
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
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
    if (role === 'professor') {
      const updated = profiles.find((p) => p.id === userId)
      if (updated) setProfessors((prev) => [...prev, { ...updated, role: 'professor' }])
    }
    setAssigning(null)
  }

  const allUsers = profiles.filter((p) => p.role != null)
  const userSearchLower = userSearchQuery.trim().toLowerCase()
  const filteredUsers =
    userSearchLower === ''
      ? allUsers
      : allUsers.filter((p) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ').toLowerCase()
          const email = (p.email ?? '').toLowerCase()
          const roll = (p.roll_number ?? '').toLowerCase()
          return name.includes(userSearchLower) || email.includes(userSearchLower) || roll.includes(userSearchLower)
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
        User Management
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Only emails in the &quot;Signup emails&quot; list can create an account. Students with an allowed email sign up on their own; admins add professor accounts (they must reset their temporary password on first login).
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          Add professor
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Create a professor account by email. They will receive a temporary password and must set a permanent one on first login.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="professor-email">Email</label>
            <input
              id="professor-email"
              type="email"
              className="form-control"
              placeholder="professor@example.com"
              value={professorEmail}
              onChange={(e) => setProfessorEmail(e.target.value)}
              disabled={creatingProfessor}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="professor-temp-password">Temporary password</label>
            <input
              id="professor-temp-password"
              type="text"
              className="form-control"
              placeholder="Min 8 characters"
              value={professorTempPassword}
              onChange={(e) => setProfessorTempPassword(e.target.value)}
              disabled={creatingProfessor}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="professor-first-name">First name (optional)</label>
            <input
              id="professor-first-name"
              type="text"
              className="form-control"
              placeholder="First name"
              value={professorFirstName}
              onChange={(e) => setProfessorFirstName(e.target.value)}
              disabled={creatingProfessor}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="professor-last-name">Last name (optional)</label>
            <input
              id="professor-last-name"
              type="text"
              className="form-control"
              placeholder="Last name"
              value={professorLastName}
              onChange={(e) => setProfessorLastName(e.target.value)}
              disabled={creatingProfessor}
            />
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '0.5rem 1.25rem' }}
            disabled={creatingProfessor || !professorEmail.trim() || professorTempPassword.length < 8}
            onClick={async () => {
              setError(null)
              setCreatingProfessor(true)
              const { data: { session } } = await supabase.auth.getSession()
              const headers: Record<string, string> = { 'Content-Type': 'application/json' }
              if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
              const res = await fetch('/api/admin/create-professor', {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                  email: professorEmail.trim(),
                  tempPassword: professorTempPassword,
                  firstName: professorFirstName.trim() || undefined,
                  lastName: professorLastName.trim() || undefined,
                }),
              })
              const json = await res.json().catch(() => ({}))
              setCreatingProfessor(false)
              if (!res.ok) {
                setError(json.error || 'Failed to create professor')
                return
              }
              setProfessorEmail('')
              setProfessorTempPassword('')
              setProfessorFirstName('')
              setProfessorLastName('')
              fetchData()
            }}
          >
            {creatingProfessor ? 'Creating…' : 'Create professor'}
          </button>
        </div>
      </section>
      {allUsers.length > 0 && (
        <section>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
            All Users ({filteredUsers.length}{filteredUsers.length !== allUsers.length ? ` of ${allUsers.length}` : ''})
          </h3>
          <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search by name or email..."
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              aria-label="Search users"
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
                {filteredUsers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.email || p.id}</td>
                    <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '-'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {p.role === 'student' ? (p.roll_number ?? '—') : '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        backgroundColor: p.role === 'admin' ? '#0892A5' : p.role === 'professor' ? '#0CA4A5' : '#06908F',
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
      )}
    </div>
  )
}

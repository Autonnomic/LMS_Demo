'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../types'

type AllowedEmail = { id: string; email: string; created_at: string }

export default function AdminStudentsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newSignupEmails, setNewSignupEmails] = useState('')
  const [addingEmails, setAddingEmails] = useState(false)
  const [signupEmailsError, setSignupEmailsError] = useState<string | null>(null)
  const [removingEmailId, setRemovingEmailId] = useState<string | null>(null)
  const [adminCollegeId, setAdminCollegeId] = useState<number | null>(null)

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin' || profile.college_id == null) return

    setAdminCollegeId(Number(profile.college_id))

    const [profilesRes, emailsRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role, roll_number, created_at')
        .eq('college_id', profile.college_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('allowed_signup_emails')
        .select('id, email, created_at')
        .eq('college_id', profile.college_id)
        .order('created_at', { ascending: false }),
    ])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (emailsRes.data) setAllowedEmails(emailsRes.data as AllowedEmail[])
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

  async function handleAddSignupEmails() {
    if (!adminCollegeId || addingEmails || !newSignupEmails.trim()) return
    setSignupEmailsError(null)
    setAddingEmails(true)
    const raw = newSignupEmails
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s.includes('@'))
    const emails = Array.from(new Set(raw))
    const existingSet = new Set(allowedEmails.map((e) => e.email.toLowerCase()))
    let added = 0
    for (const email of emails) {
      if (existingSet.has(email)) continue
      const { error: insertError } = await supabase
        .from('allowed_signup_emails')
        .insert({ email, college_id: adminCollegeId })
      if (insertError) {
        if (insertError.code === '23505') existingSet.add(email)
        else {
          setSignupEmailsError(insertError.message)
          break
        }
      } else {
        added++
        existingSet.add(email)
      }
    }
    setAddingEmails(false)
    setNewSignupEmails('')
    await fetchData()
  }

  async function handleRemoveSignupEmail(id: string) {
    setRemovingEmailId(id)
    await supabase.from('allowed_signup_emails').delete().eq('id', id)
    setAllowedEmails((prev) => prev.filter((e) => e.id !== id))
    setRemovingEmailId(null)
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
        Only emails in the allowed list below can create an account for your college. Add emails so students can sign up.
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          Allow signup emails
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Add one or more emails (one per line or comma-separated). Only these emails can create an account and will join your college as students.
        </p>
        {signupEmailsError && (
          <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{signupEmailsError}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <textarea
            className="form-control"
            placeholder="student1@example.com&#10;student2@example.com"
            value={newSignupEmails}
            onChange={(e) => setNewSignupEmails(e.target.value)}
            disabled={addingEmails}
            rows={3}
            style={{ minWidth: '100%', resize: 'vertical' }}
            aria-label="Emails to allow for signup"
          />
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '0.5rem 1.25rem', alignSelf: 'flex-start' }}
            disabled={addingEmails || !newSignupEmails.trim()}
            onClick={handleAddSignupEmails}
          >
            {addingEmails ? 'Adding…' : 'Add allowed emails'}
          </button>
        </div>
        {allowedEmails.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Allowed for signup ({allowedEmails.length})
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {allowedEmails.map((e) => (
                <li
                  key={e.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.5rem',
                    background: 'var(--surface)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span>{e.email}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${e.email}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', fontSize: '1rem' }}
                    disabled={removingEmailId === e.id}
                    onClick={() => handleRemoveSignupEmail(e.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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

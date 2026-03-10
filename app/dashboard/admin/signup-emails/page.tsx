'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AllowedSignupEmail } from '../types'

export default function AdminSignupEmailsPage() {
  const [allowedSignupEmails, setAllowedSignupEmails] = useState<AllowedSignupEmail[]>([])
  const [adminCollegeId, setAdminCollegeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [newAllowedEmail, setNewAllowedEmail] = useState('')
  const [addingAllowedEmail, setAddingAllowedEmail] = useState(false)
  const [removingAllowedEmailId, setRemovingAllowedEmailId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    const { data } = await supabase
      .from('allowed_signup_emails')
      .select('id, email, created_at')
      .eq('college_id', profile.college_id)
      .order('created_at', { ascending: false })
    if (data) setAllowedSignupEmails(data as AllowedSignupEmail[])
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
        Allowed signup emails
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Only users with an email in this list can create an account. Add emails to allow new students or staff to sign up.
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          Add allowed emails
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Enter one or more emails (one per line or comma-separated). Duplicates and invalid lines are skipped.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="new-allowed-email">Emails</label>
            <textarea
              id="new-allowed-email"
              className="form-control"
              placeholder={'student1@example.com\nstudent2@example.com\nstudent3@example.com'}
              value={newAllowedEmail}
              onChange={(e) => setNewAllowedEmail(e.target.value)}
              disabled={addingAllowedEmail}
              rows={4}
              style={{ minWidth: '100%', resize: 'vertical' }}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '0.5rem 1.25rem', alignSelf: 'flex-start' }}
            disabled={addingAllowedEmail || !newAllowedEmail.trim() || adminCollegeId == null}
            onClick={async () => {
              if (adminCollegeId == null) return
              setError(null)
              setAddingAllowedEmail(true)
              const raw = newAllowedEmail
                .split(/[\n,;]+/)
                .map((s) => s.trim().toLowerCase())
                .filter((s) => s.length > 0 && s.includes('@'))
              const emails = Array.from(new Set(raw))
              const existingSet = new Set(allowedSignupEmails.map((e) => e.email.toLowerCase()))
              const alreadyInList: string[] = []
              let added = 0
              for (const email of emails) {
                if (existingSet.has(email)) {
                  alreadyInList.push(email)
                  continue
                }
                const { error: insertError } = await supabase
                  .from('allowed_signup_emails')
                  .insert({ email, college_id: adminCollegeId })
                if (insertError) {
                  if (insertError.code === '23505') {
                    alreadyInList.push(email)
                    existingSet.add(email)
                  } else {
                    setError(insertError.message)
                    break
                  }
                } else {
                  added += 1
                  existingSet.add(email)
                }
              }
              setAddingAllowedEmail(false)
              if (added > 0) {
                fetchData()
                setNewAllowedEmail('')
              }
              if (alreadyInList.length > 0) {
                setError(
                  `The following email(s) are already in the list: ${alreadyInList.join(', ')}.${added > 0 ? ` Added ${added} other(s).` : ''}`
                )
              } else if (added > 0) {
                setError(null)
              }
            }}
          >
            {addingAllowedEmail ? 'Adding…' : 'Add emails'}
          </button>
        </div>
      </section>
      {allowedSignupEmails.length > 0 ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Added</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allowedSignupEmails.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{new Date(row.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
                      disabled={removingAllowedEmailId === row.id}
                      onClick={async () => {
                        setRemovingAllowedEmailId(row.id)
                        setError(null)
                        await supabase.from('allowed_signup_emails').delete().eq('id', row.id)
                        setAllowedSignupEmails((prev) => prev.filter((e) => e.id !== row.id))
                        setRemovingAllowedEmailId(null)
                      }}
                    >
                      {removingAllowedEmailId === row.id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          No allowed emails yet. Add an email above to let that user sign up.
        </div>
      )}
    </div>
  )
}

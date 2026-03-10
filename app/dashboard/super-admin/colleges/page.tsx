'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type College = { id: number; name: string; code: string }
type CollegeAdmin = { id: string; email: string | null; first_name: string | null; last_name: string | null }

export default function SuperAdminCollegesPage() {
  const [colleges, setColleges] = useState<College[]>([])
  const [adminsByCollegeId, setAdminsByCollegeId] = useState<Record<number, CollegeAdmin[]>>({})
  const [loading, setLoading] = useState(true)
  const [newCollegeName, setNewCollegeName] = useState('')
  const [newCollegeCode, setNewCollegeCode] = useState('')
  const [addingCollege, setAddingCollege] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createAdminForCollege, setCreateAdminForCollege] = useState<College | null>(null)
  const [createAdminForm, setCreateAdminForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    tempPassword: '',
  })
  const [creatingAdmin, setCreatingAdmin] = useState(false)
  const [createAdminError, setCreateAdminError] = useState<string | null>(null)
  const [editingCollege, setEditingCollege] = useState<College | null>(null)
  const [editCollegeForm, setEditCollegeForm] = useState({ name: '', code: '' })
  const [savingCollege, setSavingCollege] = useState(false)
  const [editCollegeError, setEditCollegeError] = useState<string | null>(null)
  const [editingAdmin, setEditingAdmin] = useState<CollegeAdmin | null>(null)
  const [editAdminForm, setEditAdminForm] = useState({ email: '', firstName: '', lastName: '', newPassword: '' })
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [editAdminError, setEditAdminError] = useState<string | null>(null)

  async function fetchColleges() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'super_admin') return

    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    const res = await fetch('/api/super-admin/colleges', { method: 'GET', credentials: 'include', headers })
    if (!res.ok) return
    const json = await res.json().catch(() => ({}))
    if (Array.isArray(json.colleges)) setColleges(json.colleges)
    if (json.adminsByCollegeId && typeof json.adminsByCollegeId === 'object') setAdminsByCollegeId(json.adminsByCollegeId)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchColleges()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleAddCollege() {
    if (!newCollegeName.trim() || !newCollegeCode.trim() || addingCollege) return
    setError(null)
    setAddingCollege(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    const res = await fetch('/api/super-admin/colleges', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        name: newCollegeName.trim(),
        code: newCollegeCode.trim(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setAddingCollege(false)
    if (!res.ok) {
      setError(json.error || 'Failed to add college')
      return
    }
    setNewCollegeName('')
    setNewCollegeCode('')
    await fetchColleges()
  }

  async function handleCreateAdmin() {
    if (!createAdminForCollege) return
    const { email, firstName, lastName, tempPassword } = createAdminForm
    if (!email.trim() || !tempPassword || tempPassword.length < 8) {
      setCreateAdminError('Email and password (min 8 characters) are required.')
      return
    }
    setCreateAdminError(null)
    setCreatingAdmin(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    const res = await fetch('/api/super-admin/create-admin', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        collegeId: createAdminForCollege.id,
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        tempPassword,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setCreatingAdmin(false)
    if (!res.ok) {
      setCreateAdminError(json.error || 'Failed to create admin')
      return
    }
    setCreateAdminForCollege(null)
    setCreateAdminForm({ email: '', firstName: '', lastName: '', tempPassword: '' })
    await fetchColleges()
  }

  async function handleSaveCollege() {
    if (!editingCollege) return
    const { name, code } = editCollegeForm
    if (!name.trim()) {
      setEditCollegeError('College name is required')
      return
    }
    if (!code.trim()) {
      setEditCollegeError('College code is required')
      return
    }
    setEditCollegeError(null)
    setSavingCollege(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    const res = await fetch(`/api/super-admin/colleges/${editingCollege.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ name: name.trim(), code: code.trim() }),
    })
    const json = await res.json().catch(() => ({}))
    setSavingCollege(false)
    if (!res.ok) {
      setEditCollegeError(json.error || 'Failed to update college')
      return
    }
    setEditingCollege(null)
    await fetchColleges()
  }

  async function handleSaveAdmin() {
    if (!editingAdmin) return
    const { email, firstName, lastName, newPassword } = editAdminForm
    if (!email.trim()) {
      setEditAdminError('Email is required')
      return
    }
    setEditAdminError(null)
    setSavingAdmin(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    const res = await fetch(`/api/super-admin/admins/${editingAdmin.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        ...(newPassword.length >= 8 && { newPassword }),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSavingAdmin(false)
    if (!res.ok) {
      setEditAdminError(json.error || 'Failed to update admin')
      return
    }
    setEditingAdmin(null)
    await fetchColleges()
  }

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
        Colleges
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Add colleges and create an admin for each college. College admins can manage users, courses, and settings for their college only.
      </p>

      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          Add college
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="new-college-name">College name *</label>
              <input
                id="new-college-name"
                type="text"
                className="form-control"
                placeholder="e.g. Engineering College"
                value={newCollegeName}
                onChange={(e) => setNewCollegeName(e.target.value)}
                disabled={addingCollege}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollege()}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 160px' }}>
              <label htmlFor="new-college-code">College code *</label>
              <input
                id="new-college-code"
                type="text"
                className="form-control"
                placeholder="e.g. ENG01 or COLLEGE-A"
                value={newCollegeCode}
                onChange={(e) => setNewCollegeCode(e.target.value)}
                disabled={addingCollege}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollege()}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Letters and/or numbers, unique</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '0.5rem 1.25rem', alignSelf: 'flex-start' }}
            disabled={addingCollege || !newCollegeName.trim() || !newCollegeCode.trim()}
            onClick={handleAddCollege}
          >
            {addingCollege ? 'Adding…' : 'Add college'}
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          All colleges
        </h3>
        {colleges.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No colleges yet. Add one above.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {colleges.map((college) => {
              const admins = adminsByCollegeId[college.id] ?? []
              return (
                <li
                  key={college.id}
                  style={{
                    padding: '0.75rem 0.9rem',
                    background: 'var(--surface-hover)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: admins.length > 0 ? '0.75rem' : 0 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                      {college.name}
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        ({college.code})
                      </span>
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.9rem', fontSize: '0.875rem' }}
                        onClick={() => {
                          setEditingCollege(college)
                          setEditCollegeForm({ name: college.name, code: college.code })
                          setEditCollegeError(null)
                        }}
                      >
                        Edit college
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.9rem', fontSize: '0.875rem' }}
                        onClick={() => {
                          setCreateAdminForCollege(college)
                          setCreateAdminForm({ email: '', firstName: '', lastName: '', tempPassword: '' })
                          setCreateAdminError(null)
                        }}
                      >
                        Create admin
                      </button>
                    </div>
                  </div>
                  {admins.length > 0 ? (
                    <div style={{ marginTop: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Admins</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {admins.map((a) => (
                          <li key={a.id} style={{ fontSize: '0.875rem', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span>
                              {[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}
                              {a.email && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({a.email})</span>
                              )}
                            </span>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8125rem' }}
                              onClick={() => {
                                setEditingAdmin(a)
                                setEditAdminForm({
                                  email: a.email ?? '',
                                  firstName: a.first_name ?? '',
                                  lastName: a.last_name ?? '',
                                  newPassword: '',
                                })
                                setEditAdminError(null)
                              }}
                            >
                              Edit
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editingCollege && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-college-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && !savingCollege && setEditingCollege(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-college-title" style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
              Edit college
            </h3>
            {editCollegeError && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>
                {editCollegeError}
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="edit-college-name">College name *</label>
              <input
                id="edit-college-name"
                type="text"
                className="form-control"
                value={editCollegeForm.name}
                onChange={(e) => setEditCollegeForm((p) => ({ ...p, name: e.target.value }))}
                disabled={savingCollege}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="edit-college-code">College code *</label>
              <input
                id="edit-college-code"
                type="text"
                className="form-control"
                value={editCollegeForm.code}
                onChange={(e) => setEditCollegeForm((p) => ({ ...p, code: e.target.value }))}
                disabled={savingCollege}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Letters and/or numbers, unique for all colleges.</span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={savingCollege}
                onClick={() => setEditingCollege(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={savingCollege || !editCollegeForm.name.trim() || !editCollegeForm.code.trim()}
                onClick={handleSaveCollege}
              >
                {savingCollege ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-admin-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && !savingAdmin && setEditingAdmin(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-admin-title" style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
              Edit admin
            </h3>
            {editAdminError && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>
                {editAdminError}
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="edit-admin-email">Email *</label>
              <input
                id="edit-admin-email"
                type="email"
                className="form-control"
                value={editAdminForm.email}
                onChange={(e) => setEditAdminForm((p) => ({ ...p, email: e.target.value }))}
                disabled={savingAdmin}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="edit-admin-first-name">First name</label>
                <input
                  id="edit-admin-first-name"
                  type="text"
                  className="form-control"
                  value={editAdminForm.firstName}
                  onChange={(e) => setEditAdminForm((p) => ({ ...p, firstName: e.target.value }))}
                  disabled={savingAdmin}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="edit-admin-last-name">Last name</label>
                <input
                  id="edit-admin-last-name"
                  type="text"
                  className="form-control"
                  value={editAdminForm.lastName}
                  onChange={(e) => setEditAdminForm((p) => ({ ...p, lastName: e.target.value }))}
                  disabled={savingAdmin}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="edit-admin-password">New password (optional, min 8 characters)</label>
              <input
                id="edit-admin-password"
                type="password"
                className="form-control"
                value={editAdminForm.newPassword}
                onChange={(e) => setEditAdminForm((p) => ({ ...p, newPassword: e.target.value }))}
                disabled={savingAdmin}
                placeholder="Leave blank to keep current"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={savingAdmin}
                onClick={() => setEditingAdmin(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={savingAdmin || !editAdminForm.email.trim()}
                onClick={handleSaveAdmin}
              >
                {savingAdmin ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createAdminForCollege && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-admin-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && !creatingAdmin && setCreateAdminForCollege(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-admin-title" style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
              Create admin for {createAdminForCollege.name}
            </h3>
            {createAdminError && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>
                {createAdminError}
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="admin-email">Email *</label>
              <input
                id="admin-email"
                type="email"
                className="form-control"
                value={createAdminForm.email}
                onChange={(e) => setCreateAdminForm((p) => ({ ...p, email: e.target.value }))}
                disabled={creatingAdmin}
                placeholder="admin@college.edu"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="admin-first-name">First name</label>
                <input
                  id="admin-first-name"
                  type="text"
                  className="form-control"
                  value={createAdminForm.firstName}
                  onChange={(e) => setCreateAdminForm((p) => ({ ...p, firstName: e.target.value }))}
                  disabled={creatingAdmin}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="admin-last-name">Last name</label>
                <input
                  id="admin-last-name"
                  type="text"
                  className="form-control"
                  value={createAdminForm.lastName}
                  onChange={(e) => setCreateAdminForm((p) => ({ ...p, lastName: e.target.value }))}
                  disabled={creatingAdmin}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="admin-password">Temporary password * (min 8 characters)</label>
              <input
                id="admin-password"
                type="password"
                className="form-control"
                value={createAdminForm.tempPassword}
                onChange={(e) => setCreateAdminForm((p) => ({ ...p, tempPassword: e.target.value }))}
                disabled={creatingAdmin}
                placeholder="••••••••"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={creatingAdmin}
                onClick={() => setCreateAdminForCollege(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '0.5rem 1rem' }}
                disabled={creatingAdmin || !createAdminForm.email.trim() || createAdminForm.tempPassword.length < 8}
                onClick={handleCreateAdmin}
              >
                {creatingAdmin ? 'Creating…' : 'Create admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '../types'

export default function AdminProfessorsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allCourses, setAllCourses] = useState<{ id: string; code: string | null; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingProfessor, setCreatingProfessor] = useState(false)
  const [professorEmail, setProfessorEmail] = useState('')
  const [professorTempPassword, setProfessorTempPassword] = useState('')
  const [professorFirstName, setProfessorFirstName] = useState('')
  const [professorLastName, setProfessorLastName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [eligibleCourseIds, setEligibleCourseIds] = useState<string[]>([])
  const [eligibleDropdownOpen, setEligibleDropdownOpen] = useState(false)
  const eligibleDropdownRef = useRef<HTMLDivElement>(null)
  const [eligibilityByProfessor, setEligibilityByProfessor] = useState<Record<string, { id: string; code: string | null; name: string | null }[]>>({})
  const [removingEligibility, setRemovingEligibility] = useState<string | null>(null)

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin' || profile.college_id == null) return

    const { data: profilesData } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, role, roll_number, created_at')
      .eq('college_id', profile.college_id)
      .order('created_at', { ascending: false })
    if (profilesData) {
      setProfiles(profilesData as Profile[])
    }

    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const coursesRes = await fetch('/api/admin/courses', {
      method: 'GET',
      credentials: 'include',
      headers,
    })
    let coursesList: { id: string; code: string | null; name: string | null }[] = []
    if (coursesRes.ok) {
      const json = await coursesRes.json().catch(() => ({}))
      if (Array.isArray(json.courses)) {
        coursesList = (json.courses as any[]).map((c) => ({
          id: c.id as string,
          code: (c.code ?? null) as string | null,
          name: (c.name ?? null) as string | null,
        }))
        setAllCourses(coursesList)
      }
    } else {
      setAllCourses([])
    }

    const { data: eligData } = await supabase
      .from('professor_course_eligibility')
      .select('professor_id, course_id')
    const byProf: Record<string, { id: string; code: string | null; name: string | null }[]> = {}
    const courseMap = new Map(coursesList.map((c) => [c.id, c]))
    if (eligData) {
      for (const row of eligData as { professor_id: string; course_id: string }[]) {
        const profId = row.professor_id
        if (!byProf[profId]) byProf[profId] = []
        const c = courseMap.get(row.course_id)
        if (c) byProf[profId].push({ id: c.id, code: c.code ?? null, name: c.name ?? null })
      }
    }
    setEligibilityByProfessor(byProf)
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (eligibleDropdownRef.current && !eligibleDropdownRef.current.contains(e.target as Node)) {
        setEligibleDropdownOpen(false)
      }
    }
    if (eligibleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [eligibleDropdownOpen])

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

  async function handleRemoveEligibility(professorId: string, courseId: string) {
    const key = `${professorId}-${courseId}`
    setRemovingEligibility(key)
    setError(null)
    const { error: delError } = await supabase
      .from('professor_course_eligibility')
      .delete()
      .eq('professor_id', professorId)
      .eq('course_id', courseId)
    setRemovingEligibility(null)
    if (delError) {
      setError(delError.message)
      return
    }
    setEligibilityByProfessor((prev) => {
      const list = prev[professorId]?.filter((c) => c.id !== courseId) ?? []
      const next = { ...prev }
      if (list.length) next[professorId] = list
      else delete next[professorId]
      return next
    })
  }

  const professors = profiles.filter((p) => p.role === 'professor')
  const searchLower = searchQuery.trim().toLowerCase()
  const filteredProfessors =
    searchLower === ''
      ? professors
      : professors.filter((p) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ').toLowerCase()
          const email = (p.email ?? '').toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
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
        Professors
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Create professor accounts below. They must reset their temporary password on first login. Only emails in the &quot;Signup emails&quot; list can create an account.
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          Create professor
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
        {allCourses.length > 0 && (
          <div className="form-group" style={{ marginTop: '1rem' }} ref={eligibleDropdownRef}>
            <label htmlFor="professor-eligible-courses">Eligible courses (optional)</label>
            <div
              id="professor-eligible-courses"
              role="combobox"
              aria-expanded={eligibleDropdownOpen}
              aria-haspopup="listbox"
              className="form-control"
              style={{
                cursor: 'pointer',
                minHeight: '2.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onClick={() => setEligibleDropdownOpen((o) => !o)}
            >
              <span style={{ color: eligibleCourseIds.length ? 'var(--text)' : 'var(--text-muted)' }}>
                {eligibleCourseIds.length === 0
                  ? 'Select courses…'
                  : eligibleCourseIds.length === 1
                    ? (() => {
                        const c = allCourses.find((x) => x.id === eligibleCourseIds[0])
                        return c ? [c.code, c.name].filter(Boolean).join(' — ') : '1 course selected'
                      })()
                    : `${eligibleCourseIds.length} courses selected`}
              </span>
              <span style={{ marginLeft: '0.5rem' }}>{eligibleDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {eligibleDropdownOpen && (
              <div
                role="listbox"
                style={{
                  marginTop: '2px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--surface)',
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: '2px 0',
                  width: '100%',
                }}
              >
                {allCourses.map((c) => {
                  const label = [c.code, c.name].filter(Boolean).join(' — ')
                  const checked = eligibleCourseIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      role="option"
                      aria-selected={checked}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 0,
                        padding: '0.35rem 0.5rem',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        style={{
                          flexShrink: 0,
                          width: 'auto',
                          margin: 0,
                          marginRight: '0.35rem',
                        }}
                        onChange={() => {
                          setEligibleCourseIds((prev) =>
                            prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          )
                        }}
                      />
                      <span style={{ flex: '0 0 auto' }}>{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Professors will only appear in the course assignment dropdown for the courses selected here.
            </p>
          </div>
        )}
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
                  eligibleCourseIds: eligibleCourseIds,
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
              setEligibleCourseIds([])
              fetchData()
            }}
          >
            {creatingProfessor ? 'Creating…' : 'Create professor'}
          </button>
        </div>
      </section>
      {professors.length > 0 && (
        <section>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
            All professors ({filteredProfessors.length}{filteredProfessors.length !== professors.length ? ` of ${professors.length}` : ''})
          </h3>
          <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search professors"
              style={{ width: '100%' }}
            />
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Courses</th>
                  <th>Change role</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfessors.map((p) => (
                  <tr key={p.id}>
                    <td>{p.email || p.id}</td>
                    <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '-'}</td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        backgroundColor: p.role === 'admin' ? '#0892A5' : '#0CA4A5',
                        color: 'white'
                      }}>
                        {p.role}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      {(eligibilityByProfessor[p.id]?.length ?? 0) > 0 ? (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          {eligibilityByProfessor[p.id].map((c) => {
                            const label = [c.code, c.name].filter(Boolean).join(' — ') || c.id
                            const key = `${p.id}-${c.id}`
                            const isRemoving = removingEligibility === key
                            return (
                              <span
                                key={c.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.2rem 0.4rem',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  background: 'var(--surface-hover)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
                                  {label}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${label}`}
                                  disabled={isRemoving}
                                  onClick={() => handleRemoveEligibility(p.id, c.id)}
                                  style={{
                                    padding: 0,
                                    margin: 0,
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'var(--text-muted)',
                                    color: 'white',
                                    cursor: isRemoving ? 'not-allowed' : 'pointer',
                                    fontSize: '0.75rem',
                                    lineHeight: 1,
                                    opacity: isRemoving ? 0.6 : 1,
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <select
                        id={`role-${p.id}`}
                        className="form-control"
                        defaultValue={p.role ?? 'professor'}
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
                          const newRole = (sel?.value as 'student' | 'professor' | 'admin') || 'professor'
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

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface StudentProfile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  roll_number: string | null
}

interface StudentFeeRow {
  student_id: string
  amount_due: number
  amount_paid: number
  due_date: string | null
}

interface FeeRecord {
  student: StudentProfile
  amount_due: number
  amount_paid: number
  due_date: string | null
}

type FilterStatus = 'all' | 'paid' | 'unpaid'

function clampPaid(paid: number, total: number) {
  return Math.min(Math.max(0, paid), Math.max(0, total))
}

export default function AdminFeesPage() {
  const [records, setRecords] = useState<FeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, { total: number; paid: number }>>({})

  async function load() {
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: adminProfile } = await supabase
        .from('user_profiles')
        .select('college_id')
        .eq('id', user.id)
        .single()
      if (!adminProfile?.college_id) return
      const { data: students, error: studentsErr } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, roll_number')
        .eq('role', 'student')
        .eq('college_id', adminProfile.college_id)
        .order('first_name')

      if (studentsErr) throw studentsErr

      let feeRows: StudentFeeRow[] = []
      try {
        const { data: fees } = await supabase
          .from('student_fees')
          .select('student_id, amount_due, amount_paid, due_date')
        if (fees) feeRows = fees as StudentFeeRow[]
      } catch {
        // table might not exist yet
      }

      const feeByStudent = new Map(feeRows.map((f) => [f.student_id, f]))
      const merged: FeeRecord[] = (students || []).map((s) => {
        const row = feeByStudent.get(s.id)
        return {
          student: s as StudentProfile,
          amount_due: row ? Number(row.amount_due) : 0,
          amount_paid: row ? Number(row.amount_paid) : 0,
          due_date: row?.due_date ?? null,
        }
      })
      setRecords(merged)
      setEditDraft({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byStatus =
    filter === 'paid'
      ? records.filter((r) => r.amount_due > 0 && r.amount_paid >= r.amount_due)
      : filter === 'unpaid'
        ? records.filter((r) => r.amount_due > 0 && r.amount_paid < r.amount_due)
        : records

  const searchLower = searchQuery.trim().toLowerCase()
  const filtered =
    searchLower === ''
      ? byStatus
      : byStatus.filter((r) => {
          const name = [r.student.first_name, r.student.last_name].filter(Boolean).join(' ').toLowerCase()
          const email = (r.student.email ?? '').toLowerCase()
          const roll = (r.student.roll_number ?? '').toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower) || roll.includes(searchLower)
        })

  const getRowValues = (r: FeeRecord) => {
    const sid = r.student.id
    const draft = editDraft[sid]
    const total = draft !== undefined ? draft.total : r.amount_due
    const paid = draft !== undefined ? draft.paid : r.amount_paid
    const paidExceedsTotal = total >= 0 && paid > total
    const paidForCalc = paidExceedsTotal ? total : paid
    const due = Math.max(0, total - paidForCalc)
    return { total, paid, due, paidExceedsTotal }
  }

  const status = (r: FeeRecord) => {
    const { total, paid, paidExceedsTotal } = getRowValues(r)
    if (paidExceedsTotal) return '—'
    if (total <= 0) return '—'
    if (paid >= total) return 'Paid'
    if (paid > 0) return 'Partial'
    return 'Unpaid'
  }

  const setDraft = (studentId: string, field: 'total' | 'paid', value: number) => {
    const r = records.find((x) => x.student.id === studentId)
    if (!r) return
    const prev = editDraft[studentId] ?? { total: r.amount_due, paid: r.amount_paid }
    const next = { ...prev, [field]: Math.max(0, value) }
    setEditDraft((d) => ({ ...d, [studentId]: next }))
  }

  async function saveRow(r: FeeRecord) {
    const sid = r.student.id
    const { total, paid, paidExceedsTotal } = getRowValues(r)
    if (paidExceedsTotal) return
    setSavingId(sid)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/fees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          student_id: sid,
          amount_due: total,
          amount_paid: clampPaid(paid, total),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEditDraft((d) => {
        const next = { ...d }
        delete next[sid]
        return next
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
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
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '0.5rem' }}>
        Student fee payments
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
        View and edit fee status. Total and Paid are editable; Amount due is auto-calculated (Total − Paid). Paid cannot exceed Total.
      </p>

      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search students"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            minWidth: '220px',
            color: 'var(--text)',
            background: 'white',
          }}
        />
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Filter:</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'paid', 'unpaid'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '6px',
                border: `1px solid ${filter === f ? 'var(--teal-bright)' : '#d1d5db'}`,
                background: filter === f ? 'var(--teal-bright)' : 'white',
                color: filter === f ? 'white' : 'var(--text)',
                fontWeight: 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {filtered.length} student{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white' }}>
        <table className="table" style={{ margin: 0, minWidth: '720px' }}>
          <thead>
            <tr>
              <th>Roll no.</th>
              <th>Student</th>
              <th>Email</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Paid</th>
              <th style={{ textAlign: 'right' }}>Amount due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {searchQuery.trim() ? 'No students match the search.' : 'No students match the filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const { total, paid, due, paidExceedsTotal } = getRowValues(r)
                const st = status(r)
                const hasDraft = editDraft[r.student.id] !== undefined
                return (
                  <tr key={r.student.id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {r.student.roll_number || '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {[r.student.first_name, r.student.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {r.student.email || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={total === 0 ? '' : total}
                        onChange={(e) => setDraft(r.student.id, 'total', parseFloat(e.target.value) || 0)}
                        placeholder=""
                        className="fee-number-input"
                        style={{ width: '5rem', textAlign: 'right', padding: '0.35rem' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={paid === 0 ? '' : paid}
                        onChange={(e) => setDraft(r.student.id, 'paid', parseFloat(e.target.value) || 0)}
                        placeholder=""
                        className="fee-number-input"
                        style={{
                          width: '5rem',
                          textAlign: 'right',
                          padding: '0.35rem',
                          borderColor: paidExceedsTotal ? '#dc2626' : undefined,
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: due > 0 ? '#b91c1c' : 'var(--text)' }}>
                      {due > 0 ? due.toFixed(2) : '—'}
                    </td>
                    <td>
                      {paidExceedsTotal ? (
                        <div
                          role="alert"
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            background: '#fef2f2',
                            color: '#991b1b',
                            border: '1px solid #fecaca',
                            maxWidth: '200px',
                          }}
                        >
                          Paid is more than total
                        </div>
                      ) : (
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: st === 'Paid' ? '#dcfce7' : st === 'Unpaid' ? '#fee2e2' : '#fef3c7',
                            color: st === 'Paid' ? '#166534' : st === 'Unpaid' ? '#991b1b' : '#92400e',
                          }}
                        >
                          {st}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => saveRow(r)}
                        disabled={savingId === r.student.id || !hasDraft || paidExceedsTotal}
                        className="btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        {savingId === r.student.id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

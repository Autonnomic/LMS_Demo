'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EnrollmentRequest } from '../types'
import { getCourseColor } from '../types'

export default function AdminEnrollmentsPage() {
  const [enrollmentRequests, setEnrollmentRequests] = useState<EnrollmentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingEnrollment, setProcessingEnrollment] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') return
    const { data } = await supabase
      .from('course_registrations')
      .select(`
        id,
        student_id,
        course_id,
        registered_at,
        status,
        student:user_profiles!course_registrations_student_id_fkey (
          first_name,
          last_name,
          email
        ),
        course:courses!course_registrations_course_id_fkey (
          code,
          name
        )
      `)
      .eq('status', 'pending')
      .order('registered_at', { ascending: false })
    if (data) setEnrollmentRequests(data as unknown as EnrollmentRequest[])
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

  async function handleEnrollmentRequest(registrationId: string, action: 'accept' | 'reject') {
    setProcessingEnrollment(registrationId)
    setError(null)
    const res = await fetch('/api/admin/enrollment-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, action }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || `Failed to ${action} enrollment request`)
      setProcessingEnrollment(null)
      return
    }
    setEnrollmentRequests((prev) => prev.filter((r) => r.id !== registrationId))
    setProcessingEnrollment(null)
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
        Enrollment Requests
      </h2>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {enrollmentRequests.length > 0 ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Course</th>
                <th>Requested At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrollmentRequests.map((request) => {
                const color = getCourseColor(request.course_id)
                return (
                  <tr key={request.id}>
                    <td>
                      {[request.student.first_name, request.student.last_name].filter(Boolean).join(' ') || 'Unknown'}
                    </td>
                    <td>{request.student.email || '-'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: color,
                          }}
                        />
                        <span>
                          <strong>{request.course.code}</strong> - {request.course.name}
                        </span>
                      </span>
                    </td>
                    <td>{new Date(request.registered_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                          disabled={processingEnrollment === request.id}
                          onClick={() => handleEnrollmentRequest(request.id, 'accept')}
                        >
                          {processingEnrollment === request.id ? 'Processing…' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                          disabled={processingEnrollment === request.id}
                          onClick={() => handleEnrollmentRequest(request.id, 'reject')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <p>No pending enrollment requests</p>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, must_reset_password')
        .eq('id', user.id)
        .single()
      if (!profile?.must_reset_password || profile.role !== 'professor') {
        router.replace(profile?.role ? `/dashboard/${profile.role}` : '/dashboard')
        return
      }
      setLoading(false)
    }
    check()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setSubmitting(false)
      setError(updateError.message)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const res = await fetch('/api/clear-must-reset-password', { method: 'POST', credentials: 'include', headers })
    setSubmitting(false)
    if (!res.ok) {
      setError('Could not complete setup. Please try again.')
      return
    }
    router.replace('/dashboard/professor')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="subtitle">Loading…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Set your password</h1>
        <p className="subtitle">
          This is your first login. Please choose a permanent password to replace the temporary one.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>
        <p className="auth-footer">
          <Link href="/">Back to login</Link>
        </p>
      </div>
    </main>
  )
}

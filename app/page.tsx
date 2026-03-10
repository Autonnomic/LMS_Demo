'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // If user lands here with an existing session (e.g. after email confirmation), redirect to dashboard
  useEffect(() => {
    let cancelled = false
    let authUnsubscribe: (() => void) | null = null
    async function redirectIfSession(session: { access_token: string; refresh_token?: string } | null) {
      if (!session?.access_token) return
      const registerRes = await fetch('/api/auth/register-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      })
      if (cancelled) return
      if (registerRes.status === 409) {
        setError('This account is already logged in on another device. Please log out there first.')
        setCheckingSession(false)
        return
      }
      setCheckingSession(false)
      router.replace('/dashboard')
    }
    async function checkExistingSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user) {
        await redirectIfSession(session)
        return
      }
      setCheckingSession(false)
      // Session may appear after Supabase processes hash (e.g. email confirm link)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled || event !== 'SIGNED_IN' || !session) return
        redirectIfSession(session)
      })
      authUnsubscribe = () => subscription.unsubscribe()
    }
    checkExistingSession()
    return () => {
      cancelled = true
      authUnsubscribe?.()
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const input = email.trim()
    let loginEmail: string

    if (input.includes('@')) {
      loginEmail = input
    } else {
      const res = await fetch('/api/auth/email-by-roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll_number: input }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoading(false)
        setError(data.error || 'No account found for this roll number.')
        return
      }
      loginEmail = data.email
      if (!loginEmail) {
        setLoading(false)
        setError('No account found for this roll number.')
        return
      }
    }

    // Same browser/tab: if already logged in as this user (e.g. another tab), block before calling server
    const { data: { session: existingSession } } = await supabase.auth.getSession()
    if (existingSession?.user?.email?.toLowerCase() === loginEmail.toLowerCase()) {
      setLoading(false)
      setError('This account is already logged in in another tab or window. Please use that tab or log out there first.')
      return
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })
    if (signInError) {
      setLoading(false)
      setError(signInError.message)
      return
    }
    const userId = data.user?.id
    const session = data.session
    if (!userId || !session) {
      setLoading(false)
      setError('Could not get user.')
      return
    }

    // Single-session: if already logged in on another device, block this login
    const registerRes = await fetch('/api/auth/register-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (registerRes.status === 409) {
      await supabase.auth.signOut()
      setLoading(false)
      setError('This account is already logged in on another device. Please log out there first.')
      return
    }
    if (!registerRes.ok) {
      setLoading(false)
      setError('Could not complete sign-in. Please try again.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, must_reset_password')
      .eq('id', userId)
      .single()
    setLoading(false)

    let role = profile?.role as string | undefined
    if (profileError || !role) {
      const accessToken = data.session?.access_token
      const res = await fetch('/api/self-assign-student', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error || 'Could not complete signup.')
        return
      }
      role = 'student'
    }
    if (role === 'professor' && profile?.must_reset_password) {
      router.replace('/reset-password')
      return
    }
    router.replace(`/dashboard/${role}`)
  }

  if (checkingSession) {
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
      <img src="/logo.png" alt="Logo" className="auth-page-logo" />
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="subtitle">Welcome back. Sign in to your account.</p>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Username</label>
            <input
              id="email"
              type="text"
              placeholder="you@example.com or Gt001"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-footer">
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  )
}

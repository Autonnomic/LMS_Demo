'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      setLoading(false)
      setError(signInError.message)
      return
    }
    const userId = data.user?.id
    if (!userId) {
      setLoading(false)
      setError('Could not get user.')
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
      const res = await fetch('/api/self-assign-student', { method: 'POST' })
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

  return (
    <main className="auth-page">
      <img src="/logo.png" alt="Logo" className="auth-page-logo" />
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="subtitle">Welcome back. Sign in to your account.</p>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
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

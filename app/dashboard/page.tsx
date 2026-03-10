'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function DashboardRedirect() {
  const router = useRouter()

  useEffect(() => {
    async function redirectByRole() {
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
      let role = profile?.role
      if (!role) {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        await fetch('/api/self-assign-student', { method: 'POST', credentials: 'include', headers })
        role = 'student'
      }
      if (role === 'professor' && profile?.must_reset_password) {
        router.replace('/reset-password')
        return
      }
      if (role === 'super_admin') {
        router.replace('/dashboard/super-admin')
        return
      }
      router.replace(`/dashboard/${role}`)
    }
    redirectByRole()
  }, [router])

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="subtitle">Loading…</p>
      </div>
    </main>
  )
}

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
        .select('role')
        .eq('id', user.id)
        .single()
      const role = profile?.role ?? 'student'
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

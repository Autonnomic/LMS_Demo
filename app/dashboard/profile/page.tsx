'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ProfileRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    async function redirect() {
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
      const role = profile?.role
      if (role === 'student') router.replace('/dashboard/student/profile')
      else if (role === 'professor') router.replace('/dashboard/professor/profile')
      else if (role === 'admin') router.replace('/dashboard/admin/profile')
      else router.replace('/dashboard')
    }
    redirect()
  }, [router])

  return (
    <div className="canvas-layout" style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Redirecting to profile…</p>
    </div>
  )
}

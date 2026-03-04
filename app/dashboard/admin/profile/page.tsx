'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminSidebar from '../../components/AdminSidebar'
import ProfileContent, { type ProfileData } from '../../components/ProfileContent'

export default function AdminProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, role, created_at')
        .eq('id', user.id)
        .single()
      if (error || !profileData || profileData.role !== 'admin') {
        router.replace('/dashboard')
        return
      }
      setProfile(profileData as ProfileData)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="canvas-layout">
        <AdminSidebar />
        <main className="canvas-main-content">
          <div className="canvas-topbar"><span className="canvas-topbar-title">← Dashboard</span></div>
          <div className="canvas-content-area">
            <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
            <div className="skeleton-card skeleton" style={{ padding: '2rem', maxWidth: 480 }} />
          </div>
        </main>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="canvas-layout">
      <AdminSidebar />
      <main className="canvas-main-content">
        <ProfileContent profile={profile} dashboardHref="/dashboard/admin" />
      </main>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfileContent, { type ProfileData } from '../../components/ProfileContent'

export default function AdminProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [adminMetrics, setAdminMetrics] = useState<{
    totalUsers: number
    totalProfessors: number
    totalCourses: number
    pendingEnrollments: number
    allowedSignupEmailsCount: number
  } | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

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

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    let cancelled = false
    async function fetchMetrics() {
      try {
        const [
          { count: totalUsers },
          { count: totalProfessors },
          { count: pendingEnrollments },
          { count: allowedSignupEmailsCount },
          totalCourses,
        ] = await Promise.all([
          supabase.from('user_profiles').select('id', { count: 'exact', head: true }).then((r) => ({ count: r.count ?? 0 })),
          supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'professor').then((r) => ({ count: r.count ?? 0 })),
          supabase.from('course_registrations').select('id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => ({ count: r.count ?? 0 })),
          supabase.from('allowed_signup_emails').select('id', { count: 'exact', head: true }).then((r) => ({ count: r.count ?? 0 })),
          (async () => {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: Record<string, string> = {}
            if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
            const res = await fetch('/api/admin/courses', { method: 'GET', credentials: 'include', headers })
            if (!res.ok) return 0
            const json = await res.json().catch(() => ({}))
            return Array.isArray(json.courses) ? json.courses.length : 0
          })(),
        ])
        if (cancelled) return
        setAdminMetrics({
          totalUsers,
          totalProfessors,
          pendingEnrollments,
          allowedSignupEmailsCount,
          totalCourses,
        })
      } catch {
        if (!cancelled) setAdminMetrics(null)
      } finally {
        if (!cancelled) setMetricsLoading(false)
      }
    }
    fetchMetrics()
    return () => { cancelled = true }
  }, [profile])

  if (loading) {
    return (
      <div>
        <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
        <div className="skeleton-card skeleton" style={{ padding: '2rem', maxWidth: 480 }} />
      </div>
    )
  }

  if (!profile) return null

  return (
    <ProfileContent
      profile={profile}
      dashboardHref="/dashboard/admin"
      showBackToDashboard={false}
      totalUsers={adminMetrics?.totalUsers ?? 0}
      totalProfessors={adminMetrics?.totalProfessors ?? 0}
      totalCourses={adminMetrics?.totalCourses ?? 0}
      pendingEnrollments={adminMetrics?.pendingEnrollments ?? 0}
      allowedSignupEmailsCount={adminMetrics?.allowedSignupEmailsCount ?? 0}
      adminMetricsLoading={metricsLoading}
    />
  )
}

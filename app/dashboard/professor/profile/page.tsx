'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfileContent, { type ProfileData } from '../../components/ProfileContent'

export default function ProfessorProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [coursesTaughtCount, setCoursesTaughtCount] = useState(0)
  const [totalStudentsTaught, setTotalStudentsTaught] = useState(0)

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
      if (error || !profileData || profileData.role !== 'professor') {
        router.replace('/dashboard')
        return
      }
      setProfile(profileData as ProfileData)
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id')
        .eq('professor_id', user.id)
      const count = coursesData?.length ?? 0
      if (count > 0) {
        const courseIds = (coursesData || []).map((c: { id: string }) => c.id)
        const { count: studentsCount } = await supabase
          .from('course_registrations')
          .select('*', { count: 'exact', head: true })
          .in('course_id', courseIds)
          .eq('status', 'enrolled')
        setTotalStudentsTaught(studentsCount ?? 0)
      }
      setCoursesTaughtCount(count)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <span className="canvas-topbar-title">← Dashboard</span>
        </div>
        <div className="canvas-content-area">
          <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
          <div className="skeleton-card skeleton" style={{ padding: '2rem', maxWidth: 480 }} />
        </div>
      </main>
    )
  }

  if (!profile) return null

  return (
    <main className="canvas-main-content">
      <ProfileContent
        profile={profile}
        dashboardHref="/dashboard/professor"
        coursesTaughtCount={coursesTaughtCount}
        totalStudentsTaught={totalStudentsTaught}
      />
    </main>
  )
}

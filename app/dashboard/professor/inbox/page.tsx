'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import InboxPage from '../../student/components/InboxPage'

export default function ProfessorInboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'student' | 'professor'>('professor')
  const [courses, setCourses] = useState<{ id: string; code: string; name: string }[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profile } = await supabase.from('user_profiles').select('role, must_reset_password').eq('id', user.id).single()
      if (!profile || profile.role !== 'professor') {
        router.replace('/dashboard')
        return
      }
      if (profile.must_reset_password) {
        router.replace('/reset-password')
        return
      }
      setUserId(user.id)
      setUserRole((profile.role as 'student' | 'professor') || 'professor')

      // Load all courses where this professor teaches (primary or mapped)
      const [{ data: primaryCourses }, { data: secondaryRows }] = await Promise.all([
        supabase
          .from('courses')
          .select('id')
          .eq('professor_id', user.id),
        supabase
          .from('course_professors')
          .select('course_id')
          .eq('professor_id', user.id),
      ])

      const idSet = new Set<string>()
      ;(primaryCourses || []).forEach((c: { id: string }) => {
        if (c.id) idSet.add(c.id)
      })
      ;(secondaryRows || []).forEach((row: { course_id: string }) => {
        if (row.course_id) idSet.add(row.course_id)
      })

      const courseIds = Array.from(idSet)
      if (courseIds.length) {
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, code, name')
          .in('id', courseIds)
          .order('code', { ascending: true })
        setCourses(coursesData || [])
      } else {
        setCourses([])
      }
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <main className="canvas-main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </main>
    )
  }

  if (!userId) return null

  return (
    <main className="canvas-main-content" style={{ padding: 0, overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <InboxPage
        userId={userId}
        userRole={userRole}
        inboxHref="/dashboard/professor/inbox"
        backHref="/dashboard/professor"
        backLabel="Dashboard"
      />
    </main>
  )
}

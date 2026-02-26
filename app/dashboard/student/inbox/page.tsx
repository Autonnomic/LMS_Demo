'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import { ChatProvider } from '../components/ChatContext'
import InboxPage from '../components/InboxPage'

interface Course {
  id: string
  code: string
  name: string
}

export default function StudentInboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (!profile || profile.role !== 'student') {
        router.replace('/dashboard')
        return
      }
      setUserId(user.id)
      setUserRole((profile.role as 'student' | 'professor') || 'student')
      const { data: regs } = await supabase.from('course_registrations').select('course:courses(id, code, name)').eq('student_id', user.id).eq('status', 'enrolled')
      setCourses(regs?.map((r: any) => r.course).filter(Boolean) || [])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          </main>
        </div>
      </ChatProvider>
    )
  }

  if (!userId) return null

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <Sidebar courses={courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />
        <main className="canvas-main-content" style={{ padding: 0, overflow: 'hidden', height: '100vh' }}>
          <InboxPage
            userId={userId}
            userRole={userRole}
            inboxHref="/dashboard/student/inbox"
            backHref="/dashboard/student"
            backLabel="Dashboard"
          />
        </main>
      </div>
    </ChatProvider>
  )
}

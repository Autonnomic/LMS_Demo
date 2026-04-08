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
          <main className="canvas-main-content" style={{ padding: 0, overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', background: 'var(--navy-dark)', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="skeleton skeleton-avatar" />
                <span className="skeleton skeleton-text lg" style={{ width: '80px' }} />
              </div>
              <div className="inbox-loading-skeleton" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                <div className="inbox-loading-list" style={{ width: '320px', borderRight: '1px solid var(--border)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                      <div className="skeleton skeleton-avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="skeleton skeleton-text sm" style={{ width: '70%', marginBottom: '0.35rem' }} />
                        <div className="skeleton skeleton-text sm" style={{ width: '90%' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="inbox-loading-detail" style={{ flex: 1, padding: '16px', minWidth: 0 }}>
                  <div className="skeleton-card skeleton">
                    <div className="skeleton skeleton-text lg" style={{ width: '40%', marginBottom: '0.75rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '80%', marginBottom: '0.5rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '70%', marginBottom: '0.5rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '60%' }} />
                  </div>
                </div>
              </div>
            </div>
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
        <main className="canvas-main-content" style={{ padding: 0, overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import Chat from '../components/Chat'
import { ChatProvider } from '../components/ChatContext'
import AiHelperChat from '../components/AiHelperChat'

interface Course {
  id: string
  code: string
  name: string
}

export default function StudentAiHelperPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('student')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()
      if (!profile || profile.role !== 'student') {
        router.push('/dashboard')
        return
      }
      const firstName = profile.first_name || ''
      const lastName = profile.last_name || ''
      setUserName(`${firstName} ${lastName}`.trim() || 'Student')
      setUserInitials((firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S')
      setUserId(user.id)
      setUserRole(profile.role as 'student' | 'professor')

      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select('course:courses ( id, code, name )')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      if (coursesData) {
        setCourses(coursesData.map((r: any) => r.course).filter(Boolean))
      }
    } catch (e) {
      console.error('AI helper page error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">AI helper</h1>
            </div>
            <div className="canvas-content-area">
              <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
              <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <Sidebar courses={courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <h1 className="canvas-topbar-title">AI helper</h1>
            <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {userId && <Notifications userId={userId} />}
              {userId && <Chat userId={userId} userRole={userRole} hideTriggerButton />}
              <div
                className="canvas-user-menu"
                onClick={() => {
                  supabase.auth.signOut()
                  router.push('/')
                  router.refresh()
                }}
              >
                <div className="canvas-user-avatar">{userInitials}</div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{userName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logout</div>
                </div>
              </div>
            </div>
          </div>
          <div className="canvas-content-area" style={{ padding: 0, overflow: 'hidden' }}>
            <AiHelperChat userId={userId} />
          </div>
        </main>
      </div>
    </ChatProvider>
  )
}

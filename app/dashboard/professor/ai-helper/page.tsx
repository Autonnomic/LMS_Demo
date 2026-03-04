'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Chat from '../../student/components/Chat'
import Notifications from '../../student/components/Notifications'
import { ChatProvider } from '../../student/components/ChatContext'
import AiHelperChat from '../../student/components/AiHelperChat'

export default function ProfessorAiHelperPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'student' | 'professor'>('professor')

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
        .select('first_name, last_name, role, must_reset_password')
        .eq('id', user.id)
        .single()
      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
        return
      }
      if (profile.must_reset_password) {
        router.replace('/reset-password')
        return
      }
      const firstName = profile.first_name || ''
      const lastName = profile.last_name || ''
      setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
      setUserInitials((firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P')
      setUserId(user.id)
      setUserRole('professor')
    } catch (e) {
      console.error('Professor AI helper page error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ChatProvider>
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <span className="canvas-topbar-title">AI helper</span>
          </div>
          <div className="canvas-content-area">
            <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
            <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
          </div>
        </main>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <img src="/logo.png" alt="" className="canvas-topbar-logo-right" />
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
    </ChatProvider>
  )
}

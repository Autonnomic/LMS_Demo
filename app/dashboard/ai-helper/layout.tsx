'use client'

import { useEffect, useState, ReactNode, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../student/components/Sidebar'
import ProfessorSidebar from '../components/ProfessorSidebar'
import { ProfessorMobileBottomBar } from '../components/ProfessorMobileBottomBar'
import Notifications from '../student/components/Notifications'
import Chat from '../student/components/Chat'
import { ChatProvider } from '../student/components/ChatContext'
import UserMenu from '../components/UserMenu'

interface Course {
  id: string
  code: string
  name: string
}

interface AiHelperUser {
  userId: string
  userName: string
  userInitials: string
  userRole: 'student' | 'professor'
}

const AiHelperUserContext = createContext<AiHelperUser | null>(null)

export function useAiHelperUser() {
  return useContext(AiHelperUserContext)
}

export default function AiHelperLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'student' | 'professor' | null>(null)
  const [userInfo, setUserInfo] = useState<AiHelperUser | null>(null)
  const [studentCourses, setStudentCourses] = useState<Course[]>([])
  const [professorCourses, setProfessorCourses] = useState<Course[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          if (!cancelled && !user) router.replace('/')
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, role, must_reset_password')
          .eq('id', user.id)
          .single()

        if (!profile || cancelled) return

        const r = profile.role as string
        if (r !== 'student' && r !== 'professor') {
          if (!cancelled) router.replace('/dashboard')
          return
        }

        if (r === 'professor' && profile.must_reset_password && !cancelled) {
          router.replace('/reset-password')
          return
        }

        const firstName = (profile.first_name || '').trim()
        const lastName = (profile.last_name || '').trim()
        const userName = `${firstName} ${lastName}`.trim() || (r === 'student' ? 'Student' : 'Professor')
        const userInitials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || (r === 'student' ? 'S' : 'P')

        setUserInfo({
          userId: user.id,
          userName,
          userInitials,
          userRole: r as 'student' | 'professor',
        })
        setRole(r as 'student' | 'professor')

        if (r === 'student') {
          const { data: coursesData } = await supabase
            .from('course_registrations')
            .select('course:courses ( id, code, name )')
            .eq('student_id', user.id)
            .eq('status', 'enrolled')
          if (!cancelled && coursesData) {
            const list = (coursesData as unknown as { course: Course | null }[])
              .map((row) => row.course)
              .filter(Boolean) as Course[]
            setStudentCourses(list)
          }
        } else {
          // Professor: include courses where they are primary or mapped in course_professors
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
            if (!cancelled && coursesData) setProfessorCourses(coursesData)
          } else if (!cancelled) {
            setProfessorCourses([])
          }

          try {
            const { data: convs } = await supabase
              .from('conversations')
              .select('id')
              .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
            if (!cancelled && convs && convs.length > 0) {
              let total = 0
              for (const conv of convs as { id: string }[]) {
                const { count } = await supabase
                  .from('messages')
                  .select('*', { count: 'exact', head: true })
                  .eq('conversation_id', conv.id)
                  .eq('read', false)
                  .neq('sender_id', user.id)
                total += count || 0
              }
              if (!cancelled) setUnreadCount(total)
            }
          } catch (e) {
            console.error('Unread count:', e)
          }
        }
      } catch (err) {
        console.error('AI helper layout error:', err)
        if (!cancelled) router.replace('/dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [router])

  if (loading || !role || !userInfo) {
    return (
      <div className="canvas-layout">
        <aside className="canvas-sidebar">
          <div className="canvas-sidebar-header">
            <div className="skeleton skeleton-avatar" style={{ width: 120, height: 32 }} />
          </div>
          <nav className="canvas-sidebar-nav">
            <div className="canvas-nav-item">
              <div className="skeleton skeleton-avatar" />
              <span className="nav-text skeleton skeleton-text" style={{ width: '60%' }} />
            </div>
            <div className="canvas-nav-item">
              <div className="skeleton skeleton-avatar" />
              <span className="nav-text skeleton skeleton-text" style={{ width: '70%' }} />
            </div>
          </nav>
        </aside>
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <div className="canvas-topbar-brand">
              <span className="skeleton skeleton-text lg canvas-topbar-title" style={{ width: '100px' }} />
              <span className="skeleton canvas-topbar-logo-mobile" style={{ width: 48, height: 48, borderRadius: 8 }} />
            </div>
          </div>
          <div className="canvas-content-area">
            <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
            <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
          </div>
        </main>
      </div>
    )
  }

  const topbar = (
    <div className="canvas-topbar">
      <div className="canvas-topbar-brand">
        <h1 className="canvas-topbar-title">AI helper</h1>
        <img src="/logo.png" alt="" className="canvas-topbar-logo-mobile" />
      </div>
      <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Notifications userId={userInfo.userId} />
        <Chat userId={userInfo.userId} userRole={userInfo.userRole} hideTriggerButton />
        <UserMenu
          userName={userInfo.userName}
          userInitials={userInfo.userInitials}
          onLogout={() => {
            import('@/lib/auth').then(({ logout }) => logout())
            router.push('/')
            router.refresh()
          }}
        />
      </div>
    </div>
  )

  const content = (
    <div className="canvas-content-area" style={{ padding: 0, overflow: 'hidden' }}>
      {children}
    </div>
  )

  const pathname = usePathname()

  if (role === 'student') {
    return (
      <AiHelperUserContext.Provider value={userInfo}>
        <ChatProvider>
          <div className="canvas-layout">
            <Sidebar courses={studentCourses} />
            <main className="canvas-main-content">
              {topbar}
              {content}
            </main>
          </div>
        </ChatProvider>
      </AiHelperUserContext.Provider>
    )
  }

  return (
    <AiHelperUserContext.Provider value={userInfo}>
      <ChatProvider>
        <div className="canvas-layout">
          <ProfessorSidebar courses={professorCourses} unreadInboxCount={unreadCount} />
          <main className="canvas-main-content">
            {topbar}
            {content}
          </main>
          <ProfessorMobileBottomBar pathname={pathname} />
        </div>
      </ChatProvider>
    </AiHelperUserContext.Provider>
  )
}

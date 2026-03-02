'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../../components/Sidebar'
import Notifications from '../../components/Notifications'
import { ChatProvider } from '../../components/ChatContext'

interface Course {
  id: string
  code: string
  name: string
}

interface StudyPlanItem {
  id: string
  day_number: number
  main_topic: string
  tasks: string[]
  is_completed: boolean
}

interface StudyPlanDetail {
  id: string
  topic: string
  totalDays: number
  hoursPerDay: number
  createdAt: string
  course: Course
  items: StudyPlanItem[]
  progress: number
  completedItems: number
  totalItems: number
}

export default function StudyPlanDetailPage() {
  const router = useRouter()
  const params = useParams()
  const planId = params.planId as string

  const [loading, setLoading] = useState(true)
  const [updatingItemIds, setUpdatingItemIds] = useState<Set<string>>(new Set())

  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userId, setUserId] = useState('')
  const [plan, setPlan] = useState<StudyPlanDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [planId])

  async function fetchData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
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
      setUserInitials(
        (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S'
      )
      setUserId(user.id)

      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'enrolled')

      if (coursesData) {
        const courseList = coursesData
          .map((reg: any) => reg.course)
          .filter(Boolean) as Course[]
        setCourses(courseList)
      }

      const { data, error } = await supabase
        .from('student_study_plans')
        .select(
          `
          id,
          topic,
          total_days,
          hours_per_day,
          created_at,
          course:courses (
            id,
            code,
            name
          ),
          items:student_study_plan_items (
            id,
            day_number,
            main_topic,
            tasks,
            is_completed
          )
        `
        )
        .eq('id', planId)
        .eq('student_id', user.id)
        .maybeSingle()

      if (error || !data) {
        setError(error?.message || 'Study plan not found')
        return
      }

      const items = (data.items || []).sort(
        (a: any, b: any) => a.day_number - b.day_number
      ) as StudyPlanItem[]
      const totalItems = items.length
      const completedItems = items.filter((i) => i.is_completed).length
      const progress =
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

      setPlan({
        id: data.id,
        topic: data.topic,
        totalDays: data.total_days,
        hoursPerDay: Number(data.hours_per_day),
        createdAt: data.created_at,
        course: data.course,
        items,
        progress,
        completedItems,
        totalItems,
      })
    } catch (e) {
      console.error('Error loading study plan detail:', e)
      setError('Failed to load study plan')
    } finally {
      setLoading(false)
    }
  }

  async function toggleItemCompletion(itemId: string, isCompleted: boolean) {
    if (!plan) return

    setPlan((prev) => {
      if (!prev) return prev
      const updatedItems = prev.items.map((item) =>
        item.id === itemId ? { ...item, is_completed: isCompleted } : item
      )
      const totalItems = updatedItems.length
      const completedItems = updatedItems.filter((i) => i.is_completed).length
      const progress =
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
      return {
        ...prev,
        items: updatedItems,
        totalItems,
        completedItems,
        progress,
      }
    })

    setUpdatingItemIds((prev) => new Set(prev).add(itemId))

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/student/study-plans', {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ itemId, isCompleted }),
      })

      if (!res.ok) {
        console.error('Failed to update study plan item', await res.text())
        await fetchData()
      }
    } catch (e) {
      console.error('Error updating study plan item:', e)
      await fetchData()
    } finally {
      setUpdatingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">
                <span className="skeleton skeleton-text lg" style={{ width: '40%' }} />
              </h1>
            </div>
            <div className="canvas-content-area">
              <div
                className="skeleton skeleton-text lg"
                style={{ width: '200px', marginBottom: '1.5rem' }}
              />
              <div className="skeleton-card skeleton" style={{ height: '260px' }} />
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  if (!plan) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">Study Plan</h1>
            </div>
            <div className="canvas-content-area">
              <p style={{ color: 'var(--text-muted)' }}>{error || 'Study plan not found.'}</p>
              <Link href="/dashboard/student/study-plans" className="btn-secondary" style={{ marginTop: '1rem' }}>
                Back to study plans
              </Link>
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <Sidebar courses={courses} />
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <h1 className="canvas-topbar-title">Study Plan</h1>
            <div
              className="canvas-topbar-actions"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              {userId && <Notifications userId={userId} />}
              <div className="canvas-user-menu" onClick={handleLogout}>
                <div className="canvas-user-avatar">{userInitials}</div>
                <div>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--text)',
                    }}
                  >
                    {userName}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Logout
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="canvas-content-area">
            <Link
              href="/dashboard/student/study-plans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
              }}
            >
              ← Back to all study plans
            </Link>

            <section
              style={{
                background: 'var(--surface)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {plan.course?.code} • {plan.course?.name}
                  </div>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: 'var(--navy-dark)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {plan.topic}
                  </h2>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {plan.totalDays} days • {plan.hoursPerDay}h/day
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {plan.completedItems}/{plan.totalItems} topics done
                  </div>
                  <div
                    style={{
                      width: '140px',
                      height: '6px',
                      borderRadius: '999px',
                      background: 'var(--surface-hover)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${plan.progress}%`,
                        background: 'var(--teal-bright)',
                        transition: 'width 0.2s ease-out',
                      }}
                    />
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                Created on {new Date(plan.createdAt).toLocaleDateString()}
              </div>
            </section>

            <section>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  marginBottom: '0.75rem',
                  color: 'var(--navy-dark)',
                }}
              >
                Daily breakdown
              </h2>

              {plan.items.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  This study plan does not have any days yet.
                </p>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {plan.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.75rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: item.is_completed
                          ? 'rgba(8, 146, 165, 0.06)'
                          : 'var(--surface)',
                        display: 'flex',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ paddingTop: '0.15rem' }}>
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          disabled={updatingItemIds.has(item.id)}
                          onChange={(e) =>
                            toggleItemCompletion(item.id, e.target.checked)
                          }
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 500,
                              color: 'var(--text)',
                            }}
                          >
                            Day {item.day_number}:{' '}
                            <span
                              style={{
                                fontWeight: 500,
                              }}
                            >
                              {item.main_topic}
                            </span>
                          </div>
                        </div>
                        {item.tasks && item.tasks.length > 0 && (
                          <ul
                            style={{
                              margin: 0,
                              marginTop: '0.25rem',
                              paddingLeft: '1.1rem',
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {item.tasks.map((task, idx) => (
                              <li key={idx}>{task}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </ChatProvider>
  )
}


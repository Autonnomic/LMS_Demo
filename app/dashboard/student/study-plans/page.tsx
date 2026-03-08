'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'
import UserMenu from '../../components/UserMenu'

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

interface StudyPlan {
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

export default function StudyPlansPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')

  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([])

  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [topic, setTopic] = useState<string>('')
  const [totalDays, setTotalDays] = useState<string>('7')
  const [hoursPerDay, setHoursPerDay] = useState<string>('2')
  const [error, setError] = useState<string | null>(null)
  const [updatingItemIds, setUpdatingItemIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchInitialData()
  }, [])

  async function fetchInitialData() {
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
        if (courseList.length > 0) {
          setSelectedCourseId(courseList[0].id)
        }
      }

      await fetchStudyPlans()
    } catch (e) {
      console.error('Error loading study plans page:', e)
      setError('Failed to load study plans')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStudyPlans() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/student/study-plans', {
        method: 'GET',
        credentials: 'include',
        headers,
      })
      if (!res.ok) {
        console.error('Failed to fetch study plans', await res.text())
        return
      }
      const data = await res.json()
      setStudyPlans(data.plans || [])
    } catch (e) {
      console.error('Error fetching study plans:', e)
    }
  }

  async function handleCreatePlan(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!selectedCourseId) {
      setError('Please select a course.')
      return
    }
    if (!topic.trim()) {
      setError('Please enter a topic or unit to study.')
      return
    }

    const daysNum = Number(totalDays)
    const hoursNum = Number(hoursPerDay)
    if (!Number.isFinite(daysNum) || daysNum <= 0) {
      setError('Number of days must be a positive number.')
      return
    }
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      setError('Hours per day must be a positive number.')
      return
    }

    setSubmitting(true)
    try {
      const selectedCourse = courses.find((c) => c.id === selectedCourseId)

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
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          courseId: selectedCourseId,
          courseName: selectedCourse?.name,
          topic: topic.trim(),
          totalDays: daysNum,
          hoursPerDay: hoursNum,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(
          data?.error ||
            'Failed to generate study plan. Please try again in a moment.'
        )
        return
      }

      const data = await res.json()
      setStudyPlans(data.plans || [])

      setTopic('')
      setTotalDays('7')
      setHoursPerDay('2')
    } catch (e) {
      console.error('Error generating study plan:', e)
      setError('Unexpected error while generating study plan.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleItemCompletion(itemId: string, isCompleted: boolean) {
    // Optimistic UI update
    setStudyPlans((prev) => {
      const next = prev.map((plan) => {
        const updatedItems = plan.items.map((item) =>
          item.id === itemId ? { ...item, is_completed: isCompleted } : item
        )
        const totalItems = updatedItems.length
        const completedItems = updatedItems.filter((i) => i.is_completed).length
        const progress =
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
        return {
          ...plan,
          items: updatedItems,
          totalItems,
          completedItems,
          progress,
        }
      })
      return next
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
        // Optionally refetch from server on error to resync
        await fetchStudyPlans()
      }
    } catch (e) {
      console.error('Error updating study plan item:', e)
      // On error, refetch to restore correct state
      await fetchStudyPlans()
    } finally {
      setUpdatingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
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
              <div
                className="canvas-topbar-actions"
                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
              >
                <div className="skeleton skeleton-avatar" />
                <div className="canvas-user-menu-wrapper">
                  <div className="canvas-user-menu canvas-user-menu-trigger">
                    <div className="canvas-user-avatar skeleton" />
                    <div>
                      <div
                        className="skeleton skeleton-text lg"
                        style={{ width: '120px', marginBottom: '0.25rem' }}
                      />
                      <div
                        className="skeleton skeleton-text sm"
                        style={{ width: '60px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="canvas-content-area">
              <div
                className="skeleton skeleton-text lg"
                style={{ width: '200px', marginBottom: '1.5rem' }}
              />
              <div
                className="skeleton-card skeleton"
                style={{ marginBottom: '1rem', height: '200px' }}
              />
              <div className="skeleton-card skeleton" style={{ height: '200px' }} />
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
            <h1 className="canvas-topbar-title">Study Plans</h1>
            <div
              className="canvas-topbar-actions"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              {userId && <Notifications userId={userId} />}
              <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
            </div>
          </div>

          <div className="canvas-content-area">
            <section
              style={{
                marginBottom: '2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
              }}
            >
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  width: '100%',
                  maxWidth: '720px',
                }}
              >
                <h2
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    color: 'var(--navy-dark)',
                  }}
                >
                  Create a study plan
                </h2>
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-muted)',
                    marginBottom: '1.25rem',
                  }}
                >
                  Select a course, describe what you want to study, and how much
                  time you have. AI will generate a focused plan with one main
                  topic per day and the key things to complete.
                </p>

                {error && (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(184, 84, 80, 0.25)',
                      background: 'rgba(184, 84, 80, 0.06)',
                      color: 'var(--error)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleCreatePlan}>
                  <div className="form-group">
                    <label>Course</label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="form-control"
                    >
                      <option value="">Select a course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code} - {course.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Topic or unit</label>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="form-control"
                      rows={3}
                      placeholder="e.g. Data structures and algorithms midterm, focusing on trees and graphs"
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      marginBottom: '1rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                          marginBottom: '0.5rem',
                        }}
                      >
                        Number of days
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={totalDays}
                        onChange={(e) => setTotalDays(e.target.value)}
                        className="form-control"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                          marginBottom: '0.5rem',
                        }}
                      >
                        Hours per day
                      </label>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={hoursPerDay}
                        onChange={(e) => setHoursPerDay(e.target.value)}
                        className="form-control"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ width: '100%' }}
                  >
                    {submitting ? 'Creating plan...' : 'Create study plan with AI'}
                  </button>
                </form>
              </div>

              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  width: '100%',
                  maxWidth: '720px',
                }}
              >
                <h2
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    color: 'var(--navy-dark)',
                  }}
                >
                  Your progress at a glance
                </h2>
                {studyPlans.length === 0 ? (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Once you create a study plan, you&apos;ll see your daily topics and
                    completion progress here.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                  >
                    {studyPlans.slice(0, 3).map((plan) => (
                      <div
                        key={plan.id}
                        style={{
                          padding: '0.75rem 0.5rem',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.35rem',
                            gap: '0.5rem',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 500,
                              color: 'var(--text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {plan.course?.code} • {plan.topic}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {plan.completedItems}/{plan.totalItems} topics
                          </div>
                        </div>
                        <div
                          style={{
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
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  color: 'var(--navy-dark)',
                }}
              >
                All study plans
              </h2>

              {studyPlans.length === 0 ? (
                <div
                  style={{
                    background: 'var(--surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem',
                  }}
                >
                  You don&apos;t have any study plans yet. Create one above to get a
                  day-by-day breakdown of what to study.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  {studyPlans.map((plan) => (
                    <Link
                      key={plan.id}
                      href={`/dashboard/student/study-plans/${plan.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <article
                        style={{
                          background: 'var(--surface)',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          padding: '1.25rem 1.5rem',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          cursor: 'pointer',
                        }}
                      >
                        <header
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
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
                            <h3
                              style={{
                                fontSize: '1rem',
                                fontWeight: 600,
                                color: 'var(--text)',
                                marginBottom: '0.25rem',
                              }}
                            >
                              {plan.topic}
                            </h3>
                            <div
                              style={{
                                fontSize: '0.8rem',
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
                                width: '120px',
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
                        </header>
                      </article>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </ChatProvider>
  )

  async function handleLogout() {
    const { logout } = await import('@/lib/auth'); await logout()
    router.push('/')
    router.refresh()
  }
}


'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'

type ViewMode = 'month' | 'week'

interface Course {
  id: string
  code: string
  name: string
}

interface ScheduleRow {
  id: string
  course_id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
  course?: { code: string; name: string }
}

interface AssignmentRow {
  id: string
  title: string
  due_date: string
  course_id: string
  course?: { code: string; name: string }
}

interface TopicRow {
  id: string
  title: string
  scheduled_date: string
  course_id: string
  course?: { code: string; name: string }
}

type CalendarEventType = 'schedule' | 'assignment' | 'topic'

interface CalendarEvent {
  id: string
  type: CalendarEventType
  title: string
  subtitle?: string
  date: Date
  endDate?: Date
  time?: string
  link?: string
  color?: string
  courseId?: string
  courseCode?: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  if (hour === 0) return `12:${m || '00'} AM`
  if (hour === 12) return `12:${m || '00'} PM`
  if (hour < 12) return `${hour}:${(m || '00').padStart(2, '0')} AM`
  return `${hour - 12}:${(m || '00').padStart(2, '0')} PM`
}

function getEventsForRange(
  schedules: ScheduleRow[],
  assignments: AssignmentRow[],
  topics: TopicRow[],
  start: Date,
  end: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const courseColors: Record<string, string> = {}
  const palette = [
    '#0892A5', // teal
    '#2563EB', // blue
    '#10B981', // green
    '#F97316', // orange
    '#EC4899', // pink
    '#8B5CF6', // purple
    '#F59E0B', // amber
    '#EF4444', // red
  ]

  function courseColor(courseId: string): string {
    if (!courseColors[courseId]) {
      courseColors[courseId] = palette[Object.keys(courseColors).length % palette.length]
    }
    return courseColors[courseId]
  }

  // Assignments: single-day events (use due_date date, time if present)
  assignments.forEach((a) => {
    const d = new Date(a.due_date)
    if (d >= start && d <= end) {
      events.push({
        id: `assignment-${a.id}`,
        type: 'assignment',
        title: a.title,
        subtitle: a.course?.code,
        date: d,
        link: `/dashboard/student/assignments/${a.id}`,
        color: courseColor(a.course_id),
        courseId: a.course_id,
        courseCode: a.course?.code,
      })
    }
  })

  // Topics: single-day (all-day)
  topics.forEach((t) => {
    const d = new Date(t.scheduled_date + 'T12:00:00')
    if (d >= start && d <= end) {
      events.push({
        id: `topic-${t.id}`,
        type: 'topic',
        title: t.title,
        subtitle: t.course?.code,
        date: d,
        link: undefined,
        color: courseColor(t.course_id),
        courseId: t.course_id,
        courseCode: t.course?.code,
      })
    }
  })

  // Schedules: recurring weekly — generate one event per occurrence in range
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    const dayOfWeek = cursor.getDay()
    schedules.forEach((s) => {
      if (s.day_of_week !== dayOfWeek) return
      const [sh, sm] = (s.start_time || '00:00').split(':')
      const [eh, em] = (s.end_time || '23:59').split(':')
      const startDate = new Date(cursor)
      startDate.setHours(parseInt(sh, 10), parseInt(sm, 10), 0, 0)
      const endDate = new Date(cursor)
      endDate.setHours(parseInt(eh, 10), parseInt(em, 10), 0, 0)
      if (endDate <= start) return
      if (startDate > end) return
      events.push({
        id: `schedule-${s.id}-${cursor.getTime()}`,
        type: 'schedule',
        title: `${s.course?.code || 'Class'}`,
        subtitle: s.location || undefined,
        date: startDate,
        endDate,
        time: `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`,
        link: `/dashboard/student/courses/${s.course_id}`,
        color: courseColor(s.course_id),
        courseId: s.course_id,
        courseCode: s.course?.code,
      })
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())
  return events
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userId, setUserId] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [current, setCurrent] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    fetchCalendarData()
  }, [])

  useEffect(() => {
    function handleResize() {
      if (typeof window === 'undefined') return
      setIsMobile(window.innerWidth <= 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // On mobile, always show week view (hide month grid)
  useEffect(() => {
    if (isMobile && viewMode === 'month') {
      setViewMode('week')
    }
  }, [isMobile, viewMode])

  async function fetchCalendarData() {
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

      const { data: regs } = await supabase
        .from('course_registrations')
        .select('course_id')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      const courseIds = (regs || []).map((r: { course_id: string }) => r.course_id).filter(Boolean)
      if (courseIds.length === 0) {
        setCourses([])
        setLoading(false)
        return
      }

      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses ( id, code, name )
        `)
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      if (coursesData) {
        setCourses(coursesData.map((r: any) => r.course).filter(Boolean))
      }

      const [schedRes, assignRes, topicsRes] = await Promise.all([
        supabase
          .from('course_schedules')
          .select(`
            id,
            course_id,
            day_of_week,
            start_time,
            end_time,
            location,
            course:courses ( code, name )
          `)
          .in('course_id', courseIds)
          .order('day_of_week')
          .order('start_time'),
        supabase
          .from('assignments')
          .select(`
            id,
            title,
            due_date,
            course_id,
            course:courses ( code, name )
          `)
          .in('course_id', courseIds)
          .order('due_date', { ascending: true }),
        supabase
          .from('course_topics')
          .select(`
            id,
            title,
            scheduled_date,
            course_id,
            course:courses ( code, name )
          `)
          .in('course_id', courseIds)
          .order('scheduled_date', { ascending: true }),
      ])
      if (schedRes.data) setSchedules(schedRes.data as unknown as ScheduleRow[])
      if (assignRes.data) setAssignments(assignRes.data as unknown as AssignmentRow[])
      if (topicsRes.data) setTopics(topicsRes.data as unknown as TopicRow[])
    } catch (e) {
      console.error('Calendar fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const { rangeStart, rangeEnd, events } = useMemo(() => {
    let start: Date
    let end: Date
    if (viewMode === 'month') {
      start = new Date(current.getFullYear(), current.getMonth(), 1)
      end = new Date(current.getFullYear(), current.getMonth() + 1, 0)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else {
      const day = current.getDay()
      const diff = current.getDate() - day
      start = new Date(current)
      start.setDate(diff)
      start.setHours(0, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59, 999)
    }
    const evts = getEventsForRange(schedules, assignments, topics, start, end)
    return { rangeStart: start, rangeEnd: end, events: evts }
  }, [current, viewMode, schedules, assignments, topics])

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach((e) => {
      const key = dateKey(e.date)
      if (!map[key]) map[key] = []
      map[key].push(e)
    })
    return map
  }, [events])

  const courseLegend = useMemo(() => {
    const legendMap: Record<string, { courseId: string; code: string; color: string }> = {}
    events.forEach((e) => {
      if (!e.courseId) return
      if (legendMap[e.courseId]) return
      legendMap[e.courseId] = {
        courseId: e.courseId,
        code: e.courseCode || e.title,
        color: e.color || '#0892A5',
      }
    })
    return Object.values(legendMap)
  }, [events])

  const selectedKey = useMemo(
    () => (selectedDate ? dateKey(selectedDate) : null),
    [selectedDate]
  )

  function prev() {
    const next = new Date(current)
    if (viewMode === 'month') next.setMonth(next.getMonth() - 1)
    else next.setDate(next.getDate() - 7)
    setCurrent(next)
  }
  function next() {
    const next = new Date(current)
    if (viewMode === 'month') next.setMonth(next.getMonth() + 1)
    else next.setDate(next.getDate() + 7)
    setCurrent(next)
  }
  function goToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    setCurrent(d)
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">Calendar</h1>
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
        <Sidebar courses={courses} />
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            {/* <h1 className="canvas-topbar-title">Calendar</h1> */}
            <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {userId && <Notifications userId={userId} />}
              <div className="canvas-user-menu" onClick={() => { supabase.auth.signOut(); router.push('/'); router.refresh(); }}>
                <div className="canvas-user-avatar">{userInitials}</div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{userName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logout</div>
                </div>
              </div>
            </div>
          </div>

          <div className="canvas-content-area">
            <div className="calendar-toolbar" style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}>
              <button type="button" className="btn-secondary" onClick={prev} aria-label="Previous">
                ‹
              </button>
              <button type="button" className="btn-secondary" onClick={next} aria-label="Next">
                ›
              </button>
              <button type="button" className="btn-secondary" onClick={goToday}>
                Today
              </button>
              <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 180 }}>
                {(!isMobile && viewMode === 'month')
                  ? `${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`
                  : `${rangeStart.toLocaleDateString()} – ${rangeEnd.toLocaleDateString()}`}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '0.4rem 0.75rem' }}
                  onClick={() => setViewMode('week')}
                >
                  Week
                </button>
              </div>
            </div>

            {courseLegend.length > 0 && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem 1.5rem',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Course colors:
                </span>
                {courseLegend.map((c) => (
                  <span
                    key={c.courseId}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: c.color,
                      }}
                    />
                    <span style={{ color: 'var(--text)' }}>{c.code}</span>
                  </span>
                ))}
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              {!isMobile && viewMode === 'month' && (
                <div className="calendar-month" style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    {DAY_NAMES.map((day) => (
                      <div key={day} style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {day}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(100px, 1fr)' }}>
                    {(() => {
                      const first = new Date(current.getFullYear(), current.getMonth(), 1)
                      const startPad = first.getDay()
                      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
                      const cells: React.ReactNode[] = []
                      for (let i = 0; i < startPad; i++) {
                        cells.push(<div key={`pad-${i}`} style={{ minHeight: 100, padding: '0.5rem', background: 'var(--bg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />)
                      }
                      for (let day = 1; day <= daysInMonth; day++) {
                        const d = new Date(current.getFullYear(), current.getMonth(), day)
                        const key = dateKey(d)
                        const dayEvents = eventsByDay[key] || []
                        const isToday = dateKey(new Date()) === key
                        const isSelected = selectedKey === key
                        cells.push(
                          <div
                            key={day}
                            onClick={() => setSelectedDate(isSelected ? null : d)}
                            role="button"
                            aria-label={`Show events for ${d.toDateString()}`}
                            style={{
                              minHeight: 100,
                              padding: '0.5rem',
                              borderRight: '1px solid var(--border)',
                              borderBottom: '1px solid var(--border)',
                              background: isSelected
                                ? 'rgba(8, 146, 165, 0.12)'
                                : isToday
                                ? 'rgba(8, 146, 165, 0.06)'
                                : 'var(--surface)',
                              boxShadow: isSelected ? '0 0 0 2px var(--teal-bright)' : undefined,
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', color: isToday ? 'var(--teal-bright)' : 'var(--text)' }}>
                              {day}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {(isSelected ? dayEvents : dayEvents.slice(0, 3)).map((ev) => (
                                <CalendarEventChip key={ev.id} event={ev} full={isSelected} />
                              ))}
                              {!isSelected && dayEvents.length > 3 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 3} more</span>
                              )}
                            </div>
                          </div>
                        )
                      }
                      return cells
                    })()}
                  </div>
                </div>
              )}

              {viewMode === 'week' && (
                <div
                  className="calendar-week"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, 1fr)',
                    gap: isMobile ? '0.75rem' : '0.5rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(rangeStart)
                    d.setDate(d.getDate() + i)
                    const key = dateKey(d)
                    const dayEvents = eventsByDay[key] || []
                    const isToday = dateKey(new Date()) === key
                    const isSelected = selectedKey === key
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDate(isSelected ? null : d)}
                        role="button"
                        aria-label={`Show events for ${d.toDateString()}`}
                        style={{
                          minHeight: isMobile ? undefined : 320,
                          padding: '0.75rem',
                          background: isSelected
                            ? 'rgba(8, 146, 165, 0.14)'
                            : isToday
                            ? 'rgba(8, 146, 165, 0.06)'
                            : 'var(--surface-hover)',
                          borderRight:
                            !isMobile && i < 6 ? '1px solid var(--border)' : undefined,
                          boxShadow: isSelected ? '0 0 0 2px var(--teal-bright)' : undefined,
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            marginBottom: '0.5rem',
                          }}
                        >
                          {DAY_NAMES[d.getDay()]}
                        </div>
                        <div
                          style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            marginBottom: '0.75rem',
                            color: isToday ? 'var(--teal-bright)' : 'var(--text)',
                          }}
                        >
                          {d.getDate()}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          {dayEvents.map((ev) => (
                            <CalendarEventChip key={ev.id} event={ev} full />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>

            <div style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <strong>Legend:</strong> Class schedules (recurring), assignment due dates, and course topic dates from your enrolled courses.
            </div>
          </div>
        </main>
      </div>
    </ChatProvider>
  )
}

function CalendarEventChip({ event, full }: { event: CalendarEvent; full?: boolean }) {
  const content = (
    <>
      <span style={{ fontWeight: 500, fontSize: full ? '0.875rem' : '0.75rem' }}>{event.title}</span>
      {(event.subtitle || event.time) && (
        <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>{[event.subtitle, event.time].filter(Boolean).join(' · ')}</span>
      )}
    </>
  )
  const style: React.CSSProperties = {
    padding: full ? '0.5rem 0.6rem' : '0.2rem 0.4rem',
    borderRadius: 6,
    background: event.color ? `${event.color}22` : 'var(--surface-hover)',
    borderLeft: `3px solid ${event.color || 'var(--border)'}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
  if (event.link) {
    return (
      <Link href={event.link} style={{ ...style, color: 'inherit', textDecoration: 'none' }}>
        {content}
      </Link>
    )
  }
  return <div style={style}>{content}</div>
}

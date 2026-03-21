'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'
import UserMenu from '../../components/UserMenu'
import {
  getEventsForRange,
  type Course,
  type ScheduleRow,
  type AssignmentRow,
  type TopicRow,
  type CalendarEvent,
} from '@/lib/calendar-events'
import { buildICS, downloadICS } from '@/lib/icalendar'

type ViewMode = 'month' | 'week'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
    const evts = getEventsForRange(schedules, assignments, topics, start, end, 'student')
    return { rangeStart: start, rangeEnd: end, events: evts }
  }, [current, viewMode, schedules, assignments, topics])

  /** Wider range for .ics export (classes + due dates + topics). */
  const exportEventsForICS = useMemo(() => {
    let exportStart = new Date()
    exportStart.setMonth(exportStart.getMonth() - 3)
    exportStart.setHours(0, 0, 0, 0)
    let exportEnd = new Date()
    exportEnd.setMonth(exportEnd.getMonth() + 12)
    exportEnd.setHours(23, 59, 59, 999)
    return getEventsForRange(schedules, assignments, topics, exportStart, exportEnd, 'student')
  }, [schedules, assignments, topics])

  function handleExportICS() {
    const ics = buildICS(exportEventsForICS, 'Autonnomic LMS — my courses')
    const filename = `autonnomic-calendar-${new Date().toISOString().slice(0, 10)}.ics`
    downloadICS(ics, filename)
  }

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
            {/* <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">Calendar</h1>
            </div> */}
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
            <h1 className="canvas-topbar-title">Calendar</h1>
            <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {userId && <Notifications userId={userId} />}
              <UserMenu
                userName={userName}
                userInitials={userInitials}
                onLogout={() => { import('@/lib/auth').then(({ logout }) => logout()).then(() => { router.push('/'); router.refresh(); }); }}
              />
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
              <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '0.4rem 0.75rem' }}
                  onClick={handleExportICS}
                  disabled={courses.length === 0}
                  title="Download a calendar file you can import into Google Calendar, Apple Calendar, or Outlook"
                >
                  Export .ics
                </button>
                <button
                  type="button"
                  className={viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '0.4rem 0.75rem' }}
                  onClick={() => setViewMode('month')}
                >
                  Month
                </button>
                <button
                  type="button"
                  className={viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}
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
              {' '}
              Use <strong>Export .ics</strong> to download a file you can import into Google Calendar, Apple Calendar, or Outlook (about 3 months past through 12 months ahead). Re-export when your schedule changes.
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

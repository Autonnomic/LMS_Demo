/**
 * Shared calendar event generation for student (and professor) calendar views.
 */

export interface Course {
  id: string
  code: string
  name: string
}

export interface ScheduleRow {
  id: string
  course_id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
  course?: { code: string; name: string }
}

export interface AssignmentRow {
  id: string
  title: string
  due_date: string
  course_id: string
  course?: { code: string; name: string }
}

export interface TopicRow {
  id: string
  title: string
  scheduled_date: string
  course_id: string
  course?: { code: string; name: string }
}

export type CalendarEventType = 'schedule' | 'assignment' | 'topic'

export interface CalendarEvent {
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

export function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  if (hour === 0) return `12:${m || '00'} AM`
  if (hour === 12) return `12:${m || '00'} PM`
  if (hour < 12) return `${hour}:${(m || '00').padStart(2, '0')} AM`
  return `${hour - 12}:${(m || '00').padStart(2, '0')} PM`
}

export type CalendarRole = 'student' | 'professor'

export function getEventsForRange(
  schedules: ScheduleRow[],
  assignments: AssignmentRow[],
  topics: TopicRow[],
  start: Date,
  end: Date,
  role: CalendarRole = 'student'
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const courseColors: Record<string, string> = {}
  const palette = [
    '#0892A5',
    '#2563EB',
    '#10B981',
    '#F97316',
    '#EC4899',
    '#8B5CF6',
    '#F59E0B',
    '#EF4444',
  ]

  function courseColor(courseId: string): string {
    if (!courseColors[courseId]) {
      courseColors[courseId] = palette[Object.keys(courseColors).length % palette.length]
    }
    return courseColors[courseId]
  }

  assignments.forEach((a) => {
    const d = new Date(a.due_date)
    if (d >= start && d <= end) {
      const assignmentLink =
        role === 'professor'
          ? `/dashboard/professor/courses/${a.course_id}/assignments/${a.id}/submissions`
          : `/dashboard/student/assignments/${a.id}`
      events.push({
        id: `assignment-${a.id}`,
        type: 'assignment',
        title: a.title,
        subtitle: a.course?.code,
        date: d,
        link: assignmentLink,
        color: courseColor(a.course_id),
        courseId: a.course_id,
        courseCode: a.course?.code,
      })
    }
  })

  topics.forEach((t) => {
    const d = new Date(t.scheduled_date + 'T12:00:00')
    if (d >= start && d <= end) {
      const topicLink =
        role === 'professor' ? `/dashboard/professor/courses/${t.course_id}` : undefined
      events.push({
        id: `topic-${t.id}`,
        type: 'topic',
        title: t.title,
        subtitle: t.course?.code,
        date: d,
        link: topicLink,
        color: courseColor(t.course_id),
        courseId: t.course_id,
        courseCode: t.course?.code,
      })
    }
  })

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
        link:
          role === 'professor'
            ? `/dashboard/professor/courses/${s.course_id}`
            : `/dashboard/student/courses/${s.course_id}`,
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

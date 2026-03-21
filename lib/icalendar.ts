/**
 * RFC 5545 iCalendar (.ics) export for use with Google Calendar, Apple Calendar, Outlook, etc.
 */

import type { CalendarEvent } from './calendar-events'

function escapeICalText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold lines to max 75 octets (RFC 5545). */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  parts.push(rest)
  return parts.join('\r\n')
}

function toICSDateTimeUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function toICSDateOnlyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Add one calendar day for exclusive DTEND (all-day). */
function addOneDayDateOnly(d: Date): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + 1)
  return n
}

function stableUid(eventId: string): string {
  const safe = eventId.replace(/[^\w@.-]/g, '-')
  return `${safe}@autonnomic-lms`
}

/**
 * Build an iCalendar document from normalized calendar events.
 * @param events - from getEventsForRange
 * @param calendarName - shown as X-WR-CALNAME in some clients
 */
export function buildICS(events: CalendarEvent[], calendarName = 'Autonnomic LMS'): string {
  const dtstamp = toICSDateTimeUTC(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Autonnomic LMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
  ]

  for (const ev of events) {
    const uid = stableUid(ev.id)
    const summary = escapeICalText(
      ev.type === 'assignment'
        ? `Due: ${ev.title}${ev.courseCode ? ` (${ev.courseCode})` : ''}`
        : ev.type === 'topic'
          ? `${ev.title}${ev.courseCode ? ` (${ev.courseCode})` : ''}`
          : ev.title
    )
    const descParts: string[] = []
    if (ev.subtitle) descParts.push(ev.subtitle)
    if (ev.time) descParts.push(ev.time)
    if (ev.link) descParts.push(ev.link)
    const description = descParts.length ? escapeICalText(descParts.join(' — ')) : ''

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)

    if (ev.type === 'schedule' && ev.endDate) {
      lines.push(`DTSTART:${toICSDateTimeUTC(ev.date)}`)
      lines.push(`DTEND:${toICSDateTimeUTC(ev.endDate)}`)
      if (ev.subtitle) {
        lines.push(`LOCATION:${escapeICalText(ev.subtitle)}`)
      }
    } else if (ev.type === 'topic') {
      const ds = toICSDateOnlyLocal(ev.date)
      const de = toICSDateOnlyLocal(addOneDayDateOnly(ev.date))
      lines.push(`DTSTART;VALUE=DATE:${ds}`)
      lines.push(`DTEND;VALUE=DATE:${de}`)
    } else {
      // assignment — use timed if due_date has time component, else all-day
      const due = ev.date
      const hasTime =
        due.getHours() !== 0 ||
        due.getMinutes() !== 0 ||
        due.getSeconds() !== 0 ||
        due.getMilliseconds() !== 0
      if (hasTime) {
        const end = new Date(due.getTime() + 60 * 60 * 1000)
        lines.push(`DTSTART:${toICSDateTimeUTC(due)}`)
        lines.push(`DTEND:${toICSDateTimeUTC(end)}`)
      } else {
        const ds = toICSDateOnlyLocal(due)
        const de = toICSDateOnlyLocal(addOneDayDateOnly(due))
        lines.push(`DTSTART;VALUE=DATE:${ds}`)
        lines.push(`DTEND;VALUE=DATE:${de}`)
      }
    }

    lines.push(`SUMMARY:${summary}`)
    if (description) {
      lines.push(`DESCRIPTION:${description}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return lines.map((l) => foldLine(l)).join('\r\n') + '\r\n'
}

/** Trigger browser download of an .ics file. */
export function downloadICS(icsBody: string, filename = 'autonnomic-calendar.ics'): void {
  const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

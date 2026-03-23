import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    // Allow service role or authenticated admin users
    const authHeader = request.headers.get('authorization')
    const isServiceRole = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    
    if (!isServiceRole) {
      const supabase = await createServerClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      // Check if user is admin
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // Generate notifications for upcoming assignment deadlines (7-day, 48h, 24h windows)
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const in8d = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)

    // Get all students
    const { data: students } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('role', 'student')

    if (!students) {
      return NextResponse.json({ ok: true, message: 'No students found' })
    }

    let notificationsCreated = 0

    type AssignmentRow = {
      id: string
      title: string
      due_date: string
      course_id: string
      /** Supabase may infer joined relations as an object or array */
      courses?: { code: string; name: string } | { code: string; name: string }[] | null
    }

    const maybeCreateDeadlineNotification = async (
      studentId: string,
      assignment: AssignmentRow,
      type: 'deadline_7d' | 'deadline_48h' | 'deadline_24h',
      title: string,
      message: string
    ) => {
      const { data: submission } = await adminClient
        .from('assignment_submissions')
        .select('id')
        .eq('assignment_id', assignment.id)
        .eq('student_id', studentId)
        .single()

      if (submission) return

      const { data: existing } = await adminClient
        .from('notifications')
        .select('id')
        .eq('user_id', studentId)
        .eq('type', type)
        .eq('related_id', assignment.id)
        .maybeSingle()

      if (existing) return

      await adminClient
        .from('notifications')
        .insert({
          user_id: studentId,
          title,
          message,
          type,
          related_id: assignment.id
        })
      notificationsCreated++
    }

    for (const student of students) {
      const { data: enrollments } = await adminClient
        .from('course_registrations')
        .select('course_id')
        .eq('student_id', student.id)
        .eq('status', 'enrolled')

      if (!enrollments) continue

      const courseIds = enrollments.map((e: { course_id: string }) => e.course_id)

      // Assignments due in 6–8 days (7-day reminder)
      const { data: in7dAssignments } = await adminClient
        .from('assignments')
        .select('id, title, due_date, course_id, courses(code, name)')
        .in('course_id', courseIds)
        .gte('due_date', in7d.toISOString())
        .lte('due_date', in8d.toISOString())

      if (in7dAssignments) {
        for (const a of in7dAssignments) {
          const course = a.courses as unknown as { code: string; name: string } | null
          await maybeCreateDeadlineNotification(
            student.id,
            a,
            'deadline_7d',
            'Assignment due in 1 week',
            `${course?.code || 'Course'}: "${a.title}" is due in about 1 week.`
          )
        }
      }

      // Assignments due in 24–48 hours
      const { data: in48hAssignments } = await adminClient
        .from('assignments')
        .select('id, title, due_date, course_id, courses(code, name)')
        .in('course_id', courseIds)
        .gte('due_date', in24h.toISOString())
        .lte('due_date', in48h.toISOString())

      if (in48hAssignments) {
        for (const a of in48hAssignments) {
          const dueDate = new Date(a.due_date)
          const hoursUntilDue = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))
          const course = a.courses as unknown as { code: string; name: string } | null
          await maybeCreateDeadlineNotification(
            student.id,
            a,
            'deadline_48h',
            'Assignment due in 2 days',
            `${course?.code || 'Course'}: "${a.title}" is due in ${hoursUntilDue} hours.`
          )
        }
      }

      // Assignments due in 0–24 hours
      const { data: in24hAssignments } = await adminClient
        .from('assignments')
        .select('id, title, due_date, course_id, courses(code, name)')
        .in('course_id', courseIds)
        .gte('due_date', now.toISOString())
        .lte('due_date', in24h.toISOString())

      if (in24hAssignments) {
        for (const a of in24hAssignments) {
          const dueDate = new Date(a.due_date)
          const hoursUntilDue = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))
          const course = a.courses as unknown as { code: string; name: string } | null
          await maybeCreateDeadlineNotification(
            student.id,
            a,
            'deadline_24h',
            'Assignment due today',
            `${course?.code || 'Course'}: "${a.title}" is due in ${hoursUntilDue} hours.`
          )
        }
      }

      // Get upcoming classes (next 2 hours) — use same `now` as deadline windows above
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      const currentDay = now.getDay()

      const { data: schedules } = await adminClient
        .from('course_schedules')
        .select(`
          course_id,
          day_of_week,
          start_time,
          courses(code, name)
        `)
        .in('course_id', courseIds)
        .eq('day_of_week', currentDay)

      if (schedules) {
        for (const schedule of schedules) {
          const [hours, minutes] = schedule.start_time.split(':').map(Number)
          const classTime = new Date()
          classTime.setHours(hours, minutes, 0, 0)

          if (classTime > now && classTime <= twoHoursLater) {
            // Check if notification already exists for today
            const today = new Date().toISOString().split('T')[0]
            const { data: existing } = await adminClient
              .from('notifications')
              .select('id')
              .eq('user_id', student.id)
              .eq('type', 'class')
              .eq('related_id', schedule.course_id)
              .gte('created_at', `${today}T00:00:00`)
              .single()

            if (!existing) {
              const minutesUntilClass = Math.round((classTime.getTime() - now.getTime()) / (1000 * 60))
              const course = schedule.courses as unknown as { code: string; name: string } | null

              await adminClient
                .from('notifications')
                .insert({
                  user_id: student.id,
                  title: 'Class Starting Soon',
                  message: `${course?.code || 'Course'} class starts in ${minutesUntilClass} minutes`,
                  type: 'class',
                  related_id: schedule.course_id
                })

              notificationsCreated++
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      notificationsCreated
    })
  } catch (e) {
    console.error('Error generating notifications:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

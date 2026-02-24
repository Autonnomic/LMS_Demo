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

    // Generate notifications for upcoming assignments (due in next 24-48 hours)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter = new Date()
    dayAfter.setDate(dayAfter.getDate() + 2)

    // Get all students
    const { data: students } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('role', 'student')

    if (!students) {
      return NextResponse.json({ ok: true, message: 'No students found' })
    }

    let notificationsCreated = 0

    for (const student of students) {
      // Get enrolled courses
      const { data: enrollments } = await adminClient
        .from('course_registrations')
        .select('course_id')
        .eq('student_id', student.id)
        .eq('status', 'enrolled')

      if (!enrollments) continue

      const courseIds = enrollments.map(e => e.course_id)

      // Get assignments due in next 24-48 hours
      const { data: upcomingAssignments } = await adminClient
        .from('assignments')
        .select('id, title, due_date, course_id, courses(code, name)')
        .in('course_id', courseIds)
        .gte('due_date', tomorrow.toISOString())
        .lte('due_date', dayAfter.toISOString())

      // Check which assignments don't have submissions yet
      if (upcomingAssignments) {
        for (const assignment of upcomingAssignments) {
          const { data: submission } = await adminClient
            .from('assignment_submissions')
            .select('id')
            .eq('assignment_id', assignment.id)
            .eq('student_id', student.id)
            .single()

          if (!submission) {
            // Check if notification already exists
            const { data: existing } = await adminClient
              .from('notifications')
              .select('id')
              .eq('user_id', student.id)
              .eq('type', 'deadline')
              .eq('related_id', assignment.id)
              .eq('read', false)
              .single()

            if (!existing) {
              const dueDate = new Date(assignment.due_date)
              const hoursUntilDue = Math.round((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60))
              const course = assignment.courses as { code: string; name: string } | null

              await adminClient
                .from('notifications')
                .insert({
                  user_id: student.id,
                  title: 'Assignment Due Soon',
                  message: `${course?.code || 'Course'}: ${assignment.title} is due in ${hoursUntilDue} hours`,
                  type: 'deadline',
                  related_id: assignment.id
                })

              notificationsCreated++
            }
          }
        }
      }

      // Get upcoming classes (next 2 hours)
      const now = new Date()
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
              const course = schedule.courses as { code: string; name: string } | null

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

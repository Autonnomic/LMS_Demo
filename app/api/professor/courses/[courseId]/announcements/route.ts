import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params
    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    }

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, content } = body
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
      .from('user_profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'professor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('id, name, professor_id')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isPrimaryProfessor = course.professor_id === user.id
    let isCourseProfessor = isPrimaryProfessor
    if (!isCourseProfessor) {
      const { data: cp } = await admin
        .from('course_professors')
        .select('professor_id')
        .eq('course_id', courseId)
        .eq('professor_id', user.id)
        .maybeSingle()
      isCourseProfessor = !!cp
    }

    if (!isCourseProfessor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const teacherName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || 'Professor'
    const courseName = course.name || 'Course'
    const announcementTitle = title.trim()
    const notificationMessage = `New announcement posted by ${teacherName} for ${courseName}`

    const { data: announcement, error: insertError } = await admin
      .from('announcements')
      .insert({
        course_id: courseId,
        author_id: user.id,
        title: announcementTitle,
        content: (content && typeof content === 'string' ? content : '').trim(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Announcement insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const { data: enrollments } = await admin
      .from('course_registrations')
      .select('student_id')
      .eq('course_id', courseId)
      .eq('status', 'enrolled')

    if (enrollments?.length) {
      const notifications = enrollments.map(({ student_id }) => ({
        user_id: student_id,
        title: announcementTitle,
        message: notificationMessage,
        type: 'announcement',
        related_id: courseId,
      }))
      const { error: notifError } = await admin.from('notifications').insert(notifications)
      if (notifError) {
        console.error('Failed to create announcement notifications:', notifError)
      }
    }

    return NextResponse.json(announcement)
  } catch (e) {
    console.error('Announcements API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

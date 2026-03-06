import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { data: myProfile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (myProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { courseId, professorId } = body as { courseId?: string; professorId?: string }
    if (!courseId || !professorId) {
      return NextResponse.json(
        { error: 'Invalid body: courseId and professorId required' },
        { status: 400 }
      )
    }

    // Verify professor exists and has professor role
    const { data: professor } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', professorId)
      .single()

    if (!professor || professor.role !== 'professor') {
      return NextResponse.json(
        { error: 'User is not a professor' },
        { status: 400 }
      )
    }

    // Add mapping in course_professors (many-to-many). Ignore if already exists.
    const { error: linkError } = await adminClient
      .from('course_professors')
      .upsert(
        { course_id: courseId, professor_id: professorId },
        { onConflict: 'course_id,professor_id' }
      )

    if (linkError) {
      return NextResponse.json(
        { error: linkError.message },
        { status: 400 }
      )
    }

    // Optionally update primary professor on course so existing features keep working.
    await adminClient
      .from('courses')
      .update({ professor_id: professorId })
      .eq('id', courseId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

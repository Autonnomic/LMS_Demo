import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'professor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.college_id == null) {
      return NextResponse.json({ error: 'Professor must belong to a college' }, { status: 403 })
    }

    const collegeId = Number(profile.college_id)

    const { data: students, error } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name, email, roll_number')
      .eq('role', 'student')
      .eq('college_id', collegeId)
      .order('last_name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ students: students ?? [] })
  } catch (e) {
    console.error('professor/students GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


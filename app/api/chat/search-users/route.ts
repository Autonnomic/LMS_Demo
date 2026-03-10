import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()

    const { data: myProfile, error: profileError } = await admin
      .from('user_profiles')
      .select('role, college_id')
      .eq('id', user.id)
      .single()

    if (profileError || !myProfile) {
      return NextResponse.json(
        { error: profileError?.message || 'Profile not found' },
        { status: 400 }
      )
    }

    const role = myProfile.role as string
    const collegeId = myProfile.college_id

    if (!collegeId) {
      return NextResponse.json(
        { error: 'User must be assigned to a college' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const query = typeof body?.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return NextResponse.json({ users: [] })
    }

    const q = `%${query}%`

    // Students can message professors in their college.
    // Professors can message students and other professors in their college.
    let allowedRoles: string[]
    if (role === 'student') {
      allowedRoles = ['professor']
    } else if (role === 'professor') {
      allowedRoles = ['student', 'professor']
    } else {
      // For admins/super admins, allow all roles in their college.
      allowedRoles = ['student', 'professor', 'admin']
    }

    const { data, error } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name, email, role')
      .neq('id', user.id)
      .eq('college_id', collegeId)
      .in('role', allowedRoles)
      .or(
        `first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`
      )
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ users: data ?? [] })
  } catch (e) {
    console.error('chat/search-users error:', e)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}


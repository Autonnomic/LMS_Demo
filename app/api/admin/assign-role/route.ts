import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

const VALID_ROLES = ['student', 'professor', 'admin'] as const

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

    const isSuperAdmin = myProfile?.role === 'super_admin'
    const isAdmin = myProfile?.role === 'admin'
    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, role, collegeId } = body as { userId?: string; role?: string; collegeId?: number }
    if (!userId || !role || !VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      return NextResponse.json(
        { error: 'Invalid body: userId and role (student|professor|admin) required' },
        { status: 400 }
      )
    }

    if (role === 'admin') {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: 'Only super admin can assign admin role' },
          { status: 403 }
        )
      }
      if (collegeId == null || typeof collegeId !== 'number') {
        return NextResponse.json(
          { error: 'collegeId is required when assigning admin role' },
          { status: 400 }
        )
      }
      const { data: college } = await adminClient
        .from('college')
        .select('id')
        .eq('id', collegeId)
        .single()
      if (!college) {
        return NextResponse.json({ error: 'College not found' }, { status: 404 })
      }
    }

    const updatePayload = role === 'admin' && isSuperAdmin && collegeId != null
      ? { role, college_id: collegeId }
      : { role }

    const { error: updateError } = await adminClient
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', userId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

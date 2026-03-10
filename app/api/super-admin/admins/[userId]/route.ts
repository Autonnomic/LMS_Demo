import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

async function getSuperAdminClient(request: Request) {
  const user = await getAuthUser(request)
  if (!user) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { errorResponse: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }) }
  }
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: myProfile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (myProfile?.role !== 'super_admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { adminClient }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { adminClient, errorResponse } = await getSuperAdminClient(request)
  if (!adminClient) return errorResponse!

  const { userId } = await params
  if (!userId) {
    return NextResponse.json({ error: 'User id required' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, firstName, lastName, newPassword } = body as {
    email?: string
    firstName?: string
    lastName?: string
    newPassword?: string
  }

  const { data: profile } = await adminClient
    .from('user_profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
  }

  const profileUpdates: { email?: string; first_name?: string | null; last_name?: string | null } = {}
  if (typeof email === 'string') {
    const trimmed = email.trim()
    if (!trimmed.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    profileUpdates.email = trimmed
  }
  if (firstName !== undefined) profileUpdates.first_name = firstName === '' || firstName == null ? null : String(firstName).trim()
  if (lastName !== undefined) profileUpdates.last_name = lastName === '' || lastName == null ? null : String(lastName).trim()

  if (typeof newPassword === 'string' && newPassword.length > 0) {
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
      ...(profileUpdates.email && { email: profileUpdates.email }),
    })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
  } else if (profileUpdates.email) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email: profileUpdates.email,
    })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .update(profileUpdates)
      .eq('id', userId)
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}

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
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
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
    const {
      email,
      tempPassword,
      firstName,
      lastName,
    } = body as {
      email?: string
      tempPassword?: string
      firstName?: string
      lastName?: string
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      )
    }
    if (!tempPassword || typeof tempPassword !== 'string' || tempPassword.length < 8) {
      return NextResponse.json(
        { error: 'Temporary password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
      },
    })

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }
    if (!newUser.user) {
      return NextResponse.json(
        { error: 'User creation failed' },
        { status: 500 }
      )
    }

    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert(
        {
          id: newUser.user.id,
          email: newUser.user.email ?? email,
          first_name: firstName?.trim() || null,
          last_name: lastName?.trim() || null,
          role: 'professor',
          must_reset_password: true,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      userId: newUser.user.id,
      email: newUser.user.email,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

/**
 * Self-assign student role for new signups. Called when a user has no role
 * so they can log in immediately as a student without admin approval.
 */
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

    const { data: existing } = await adminClient
      .from('user_profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    const fullName = (user.user_metadata?.full_name as string) || ''
    const nameParts = fullName.trim().split(/\s+/)
    const firstName = nameParts[0] ?? null
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

    if (!existing) {
      const { error: insertError } = await adminClient
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email ?? null,
          first_name: firstName,
          last_name: lastName,
          role: 'student',
        })
      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        )
      }
      return NextResponse.json({ ok: true, role: 'student' })
    }

    if (existing.role != null) {
      return NextResponse.json({ ok: true, role: existing.role })
    }

    const { error: updateError } = await adminClient
      .from('user_profiles')
      .update({ role: 'student' })
      .eq('id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, role: 'student' })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

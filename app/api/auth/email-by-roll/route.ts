import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Resolve a student's email from their roll number (for login).
 * Only returns email for profiles with role = 'student'.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const rollNumber = typeof body.roll_number === 'string' ? body.roll_number.trim() : ''
    if (!rollNumber) {
      return NextResponse.json({ error: 'Roll number required' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { data: profile, error } = await admin
      .from('user_profiles')
      .select('id, email')
      .eq('role', 'student')
      .ilike('roll_number', rollNumber)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!profile?.email) {
      return NextResponse.json({ error: 'No account found for this roll number' }, { status: 404 })
    }

    return NextResponse.json({ email: profile.email })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

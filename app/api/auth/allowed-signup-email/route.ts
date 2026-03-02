import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Check if an email is allowed to sign up (must be in allowed_signup_emails).
 * No auth required — used by the signup page before calling signUp.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return NextResponse.json({ allowed: false, error: 'Valid email is required' }, { status: 400 })
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

    const { data, error } = await adminClient
      .from('allowed_signup_emails')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (error) {
      console.error('allowed-signup-email check error:', error)
      return NextResponse.json({ error: 'Check failed' }, { status: 500 })
    }

    return NextResponse.json({ allowed: !!data })
  } catch (e) {
    console.error('allowed-signup-email:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

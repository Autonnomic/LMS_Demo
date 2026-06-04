import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSupabasePublicKey } from '@/lib/supabase'

/**
 * Check if an email is allowed to sign up (must be in allowed_signup_emails).
 * No auth required — used by the signup page before calling signUp.
 * Uses the publishable/anon key (read-only); does not require service role.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return NextResponse.json({ allowed: false, error: 'Valid email is required' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const db = createClient(url, getSupabasePublicKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await db
      .from('allowed_signup_emails')
      .select('id')
      .eq('email', email)
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

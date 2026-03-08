import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const refresh_token = typeof body?.refresh_token === 'string' ? body.refresh_token : ''
    if (!refresh_token) {
      return NextResponse.json(
        { error: 'Missing refresh_token' },
        { status: 400 }
      )
    }

    const sessionRef = createHash('sha256').update(refresh_token).digest('hex')

    const { data: existing } = await supabase
      .from('user_sessions')
      .select('session_ref')
      .eq('user_id', user.id)
      .single()

    if (existing && existing.session_ref !== sessionRef) {
      return NextResponse.json(
        { error: 'Already logged in on another device', code: 'ALREADY_LOGGED_IN' },
        { status: 409 }
      )
    }

    await supabase
      .from('user_sessions')
      .upsert(
        { user_id: user.id, session_ref: sessionRef, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('register-session error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

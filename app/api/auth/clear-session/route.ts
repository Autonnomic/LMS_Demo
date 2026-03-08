import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    await supabase.from('user_sessions').delete().eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('clear-session error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

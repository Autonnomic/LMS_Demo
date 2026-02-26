import { NextResponse } from 'next/server'
import { createClient, getAuthUser } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = await createClient()

    const { error } = await supabase
      .from('user_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

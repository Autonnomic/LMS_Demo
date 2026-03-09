import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

/** POST: Set due_date for all student_fees rows (admin only). Body: { dueDate: "YYYY-MM-DD" } */
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''
    const match = /^\d{4}-\d{2}-\d{2}$/.exec(dueDate)
    if (!match) {
      return NextResponse.json({ error: 'Invalid dueDate: use YYYY-MM-DD' }, { status: 400 })
    }

    const { error: updateErr } = await admin
      .from('student_fees')
      .update({ due_date: dueDate, updated_at: new Date().toISOString() })
      .not('id', 'is', null)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

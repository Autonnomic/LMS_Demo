import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

    const adminClient = createServiceRoleClient()
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const student_id = body.student_id as string | undefined
    const amount_due = typeof body.amount_due === 'number' ? body.amount_due : parseFloat(body.amount_due)
    const amount_paid = typeof body.amount_paid === 'number' ? body.amount_paid : parseFloat(body.amount_paid)

    if (!student_id || typeof amount_due !== 'number' || typeof amount_paid !== 'number' || amount_due < 0 || amount_paid < 0 || amount_paid > amount_due) {
      return NextResponse.json(
        { error: 'Invalid body: student_id, amount_due (>= 0), amount_paid (0 to amount_due) required' },
        { status: 400 }
      )
    }

    const { error: upsertErr } = await adminClient
      .from('student_fees')
      .upsert(
        {
          student_id,
          amount_due,
          amount_paid: Math.min(amount_paid, amount_due),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id' }
      )

    if (upsertErr) {
      console.error('Admin fees upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message || 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Admin fees error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

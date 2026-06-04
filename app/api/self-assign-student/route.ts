import { NextResponse } from 'next/server'
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server'

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

    const adminClient = createServiceRoleClient()

    const { data: existing, error: existingError } = await adminClient
      .from('user_profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (existingError) {
      console.error('self-assign-student profile lookup:', existingError)
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const meta = user.user_metadata ?? {}
    let firstName = (meta.first_name as string)?.trim() || null
    let lastName = (meta.last_name as string)?.trim() || null
    const rollNumber = (meta.roll_number as string)?.trim() || null
    if (firstName == null && lastName == null) {
      const fullName = (meta.full_name as string) || ''
      const nameParts = fullName.trim().split(/\s+/)
      firstName = nameParts[0] ?? null
      lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
    }

    if (!existing) {
      // Allocate student to the same college as the admin who allowed this email (allowed_signup_emails.college_id)
      const emailLower = (user.email ?? '').trim().toLowerCase()
      let collegeId: number = 1
      if (emailLower) {
        const { data: allowedRow } = await adminClient
          .from('allowed_signup_emails')
          .select('college_id')
          .eq('email', emailLower)
          .not('college_id', 'is', null)
          .limit(1)
          .maybeSingle()
        if (allowedRow?.college_id != null) {
          collegeId = Number(allowedRow.college_id)
        }
      }
      const { error: insertError } = await adminClient
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email ?? null,
          first_name: firstName,
          last_name: lastName,
          roll_number: rollNumber,
          role: 'student',
          college_id: collegeId,
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
      .update({ role: 'student', ...(rollNumber != null && { roll_number: rollNumber }) })
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

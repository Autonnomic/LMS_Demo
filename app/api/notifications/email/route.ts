import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// This is a placeholder for email functionality
// In production, integrate with a service like Resend, SendGrid, or AWS SES

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { notificationId, userId, title, message } = body

    // Get user email
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId || user.id)
      .single()

    if (!profile?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    // TODO: Integrate with email service
    // Example with Resend:
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({
    //   from: 'noreply@autonnomic.com',
    //   to: profile.email,
    //   subject: title,
    //   html: `<p>${message}</p>`
    // })

    // For now, just log the email
    console.log('Email would be sent to:', profile.email)
    console.log('Subject:', title)
    console.log('Message:', message)

    return NextResponse.json({
      ok: true,
      message: 'Email notification queued (email service not configured)'
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

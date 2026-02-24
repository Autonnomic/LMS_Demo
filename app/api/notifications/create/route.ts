import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, title, message, type, relatedId } = body

    if (!userId || !title || !message || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, title, message, type' },
        { status: 400 }
      )
    }

    // Try to get auth token from header first (if passed from client)
    const authHeader = request.headers.get('authorization')
    let verifiedUser = null
    let userRole = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Token-based auth
      const token = authHeader.substring(7)
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
      const tokenClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      
      const { data: { user }, error: authError } = await tokenClient.auth.getUser()
      if (authError || !user) {
        console.error('Token auth error:', authError)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      verifiedUser = user
      
      // Get user role
      const { data: profile } = await tokenClient
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      userRole = profile?.role
    } else {
      // Cookie-based auth
      const supabase = await createServerClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.error('Cookie auth error:', authError)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      verifiedUser = user
      
      // Get user role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      userRole = profile?.role
    }

    // Verify user has permission (professor or admin)
    if (!userRole || (userRole !== 'professor' && userRole !== 'admin')) {
      console.error('User role not authorized:', userRole)
      return NextResponse.json({ error: 'Forbidden', details: `User role: ${userRole || 'none'}` }, { status: 403 })
    }

    // Use service role to insert notification
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { error } = await adminClient
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        related_id: relatedId || null
      })

    if (error) {
      console.error('Error inserting notification:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Error in notifications/create:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

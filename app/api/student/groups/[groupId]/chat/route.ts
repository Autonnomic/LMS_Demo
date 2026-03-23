import { NextResponse } from 'next/server'
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server'

async function assertMember(admin: ReturnType<typeof createServiceRoleClient>, groupId: string, userId: string) {
  const { data } = await admin
    .from('assignment_group_members')
    .select('student_id')
    .eq('assignment_group_id', groupId)
    .eq('student_id', userId)
    .maybeSingle()
  if (!data) throw { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

/**
 * GET /api/student/groups/[groupId]/chat - list messages (newest last)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createServiceRoleClient()
    await assertMember(admin, groupId, user.id)

    const { data: messages, error } = await admin
      .from('group_chat_messages')
      .select('id, sender_id, content, created_at')
      .eq('assignment_group_id', groupId)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const senderIds = Array.from(
      new Set((messages ?? []).map((m: { sender_id: string }) => m.sender_id))
    )
    const { data: profiles } = senderIds.length
      ? await admin.from('user_profiles').select('id, first_name, last_name').in('id', senderIds)
      : { data: [] }
    const profileMap = (profiles ?? []).reduce((acc: Record<string, { first_name: string | null; last_name: string | null }>, p: { id: string; first_name: string | null; last_name: string | null }) => {
      acc[p.id] = { first_name: p.first_name, last_name: p.last_name }
      return acc
    }, {})

    const list = (messages ?? []).map((m: { id: string; sender_id: string; content: string; created_at: string }) => ({
      id: m.id,
      sender_id: m.sender_id,
      sender_name: [profileMap[m.sender_id]?.first_name, profileMap[m.sender_id]?.last_name].filter(Boolean).join(' ') || 'Unknown',
      content: m.content,
      created_at: m.created_at,
    }))
    return NextResponse.json({ messages: list })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('group chat GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/student/groups/[groupId]/chat - send a message
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createServiceRoleClient()
    await assertMember(admin, groupId, user.id)

    const body = await request.json().catch(() => ({})) as { content?: string }
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const { data: message, error } = await admin
      .from('group_chat_messages')
      .insert({ assignment_group_id: groupId, sender_id: user.id, content })
      .select('id, sender_id, content, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: profile } = await admin.from('user_profiles').select('first_name, last_name').eq('id', user.id).single()
    const sender_name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
    return NextResponse.json({
      message: {
        id: message.id,
        sender_id: message.sender_id,
        sender_name,
        content: message.content,
        created_at: message.created_at,
      },
    })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) return (e as { response: NextResponse }).response
    console.error('group chat POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

async function getSuperAdminClient(request: Request) {
  const user = await getAuthUser(request)
  if (!user) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { errorResponse: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }) }
  }
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  )
  const { data: myProfile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (myProfile?.role !== 'super_admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { adminClient }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ collegeId: string }> }
) {
  const { adminClient, errorResponse } = await getSuperAdminClient(request)
  if (!adminClient) return errorResponse!

  const { collegeId: rawCollegeId } = await params
  const oldId = Number(rawCollegeId)
  if (!Number.isInteger(oldId) || oldId < 1) {
    return NextResponse.json({ error: 'Invalid college id' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, code: bodyCode } = body as { name?: string; code?: string }
  const updateName = typeof name === 'string' ? name.trim() : null
  const updateCode = typeof bodyCode === 'string' ? bodyCode.trim() : null

  if (!updateName && !updateCode) {
    return NextResponse.json(
      { error: 'Provide name and/or code to update' },
      { status: 400 }
    )
  }

  const { data: existing } = await adminClient
    .from('college')
    .select('id, name, code')
    .eq('id', oldId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'College not found' }, { status: 404 })
  }

  if (updateCode) {
    const { data: conflict } = await adminClient
      .from('college')
      .select('id')
      .eq('code', updateCode)
      .neq('id', oldId)
      .maybeSingle()
    if (conflict) {
      return NextResponse.json(
        { error: `College code "${updateCode}" is already in use` },
        { status: 400 }
      )
    }
  }

  const updatePayload: { name?: string; code?: string } = {}
  if (updateName) updatePayload.name = updateName
  if (updateCode) updatePayload.code = updateCode

  const { data: updated, error } = await adminClient
    .from('college')
    .update(updatePayload)
    .eq('id', oldId)
    .select('id, name, code')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ college: updated })
}

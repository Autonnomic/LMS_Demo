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

export async function GET(request: Request) {
  const { adminClient, errorResponse } = await getSuperAdminClient(request)
  if (!adminClient) return errorResponse!

  const [{ data: collegesData, error: collegesError }, { data: adminsData, error: adminsError }] = await Promise.all([
    adminClient
      .from('college')
      .select('id, name, code')
      .order('id', { ascending: true }),
    adminClient
      .from('user_profiles')
      .select('id, email, first_name, last_name, college_id')
      .eq('role', 'admin')
      .not('college_id', 'is', null),
  ])

  if (collegesError) {
    return NextResponse.json({ error: collegesError.message }, { status: 400 })
  }
  if (adminsError) {
    return NextResponse.json({ error: adminsError.message }, { status: 400 })
  }

  const colleges = collegesData ?? []
  const admins = adminsData ?? []
  const adminsByCollegeId: Record<number, Array<{ id: string; email: string | null; first_name: string | null; last_name: string | null }>> = {}
  for (const college of colleges) {
    adminsByCollegeId[Number(college.id)] = []
  }
  for (const admin of admins) {
    const cid = admin.college_id != null ? Number(admin.college_id) : null
    if (cid != null && adminsByCollegeId[cid]) {
      adminsByCollegeId[cid].push({
        id: admin.id,
        email: admin.email ?? null,
        first_name: admin.first_name ?? null,
        last_name: admin.last_name ?? null,
      })
    }
  }

  return NextResponse.json({ colleges, adminsByCollegeId })
}

export async function POST(request: Request) {
  const { adminClient, errorResponse } = await getSuperAdminClient(request)
  if (!adminClient) return errorResponse!

  const body = await request.json().catch(() => ({}))
  const { name, code: bodyCode } = body as { name?: string; code?: string | number }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json(
      { error: 'College name is required' },
      { status: 400 }
    )
  }
  if (typeof bodyCode !== 'string') {
    return NextResponse.json(
      { error: 'College code must be text (e.g. SRM01), not a number. Send code as a string.' },
      { status: 400 }
    )
  }
  const code = bodyCode.trim()
  if (!code) {
    return NextResponse.json(
      { error: 'College code is required (letters and/or numbers, unique)' },
      { status: 400 }
    )
  }

  const { data: existingCode } = await adminClient
    .from('college')
    .select('id')
    .eq('code', code)
    .maybeSingle()
  if (existingCode) {
    return NextResponse.json(
      { error: `College code "${code}" is already in use` },
      { status: 400 }
    )
  }

  const { data: nextIdRow } = await adminClient
    .from('college')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single()
  const collegeId = nextIdRow?.id != null ? Number(nextIdRow.id) + 1 : 1

  const { data, error } = await adminClient
    .from('college')
    .insert({ id: collegeId, name: name.trim(), code: code })
    .select('id, name, code')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ college: data })
}

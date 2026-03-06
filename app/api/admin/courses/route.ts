import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

async function getAdminClient(request: Request) {
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

  if (myProfile?.role !== 'admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { adminClient }
}

export async function GET(request: Request) {
  const { adminClient, errorResponse } = await getAdminClient(request)
  if (!adminClient) return errorResponse!

  const { data, error } = await adminClient
    .from('courses')
    .select(`
      id,
      code,
      name,
      description,
      credits,
      semester,
      academic_year,
      professor_id,
      professor:user_profiles!courses_professor_id_fkey (
        first_name,
        last_name,
        email
      )
    `)
    .order('code', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data: courseProfessors, error: cpError } = await adminClient
    .from('course_professors')
    .select(`
      id,
      course_id,
      professor_id,
      professor:user_profiles (
        id,
        first_name,
        last_name,
        email
      )
    `)

  if (cpError) {
    return NextResponse.json({ error: cpError.message }, { status: 400 })
  }

  return NextResponse.json({ courses: data ?? [], courseProfessors: courseProfessors ?? [] })
}

export async function POST(request: Request) {
  const { adminClient, errorResponse } = await getAdminClient(request)
  if (!adminClient) return errorResponse!

  const body = await request.json().catch(() => ({}))
  const {
    code,
    name,
    description,
    credits,
    semester,
    academicYear,
  } = body as {
    code?: string
    name?: string
    description?: string
    credits?: number | string
    semester?: string
    academicYear?: string
  }

  if (!code || !code.trim()) {
    return NextResponse.json({ error: 'Course code is required' }, { status: 400 })
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Course name is required' }, { status: 400 })
  }

  const parsedCredits =
    typeof credits === 'string'
      ? credits.trim() === ''
        ? null
        : Number(credits)
      : typeof credits === 'number'
        ? credits
        : null

  if (typeof parsedCredits === 'number' && (Number.isNaN(parsedCredits) || parsedCredits < 0)) {
    return NextResponse.json({ error: 'Credits must be a non-negative number' }, { status: 400 })
  }

  const insertPayload = {
    code: code.trim(),
    name: name.trim(),
    description: description?.trim() || null,
    credits: parsedCredits,
    semester: semester?.trim() || null,
    academic_year: academicYear?.trim() || null,
  }

  const { data, error } = await adminClient
    .from('courses')
    .insert(insertPayload)
    .select(`
      id,
      code,
      name,
      description,
      credits,
      semester,
      academic_year,
      professor_id,
      professor:user_profiles!courses_professor_id_fkey (
        first_name,
        last_name,
        email
      )
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ course: data })
}


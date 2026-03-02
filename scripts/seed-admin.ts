/**
 * One-time script to create an admin user.
 * Run: npx tsx scripts/seed-admin.ts
 * Uses env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Load .env.local if present (so script works without exporting env manually)
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  })
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!'
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || 'Admin'
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || 'User'

async function seedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = ADMIN_EMAIL.trim().toLowerCase()
  console.log('Creating admin user:', email)

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: ADMIN_FIRST_NAME,
      last_name: ADMIN_LAST_NAME,
    },
  })

  if (createError) {
    if (createError.message.includes('already been registered')) {
      console.log('User already exists. Ensuring profile has admin role...')
      const { data: { users } } = await adminClient.auth.admin.listUsers()
      const existing = users?.find((u) => u.email === email)
      if (!existing) {
        console.error(createError.message)
        process.exit(1)
      }
      const { error: profileError } = await adminClient
        .from('user_profiles')
        .upsert(
          {
            id: existing.id,
            email: existing.email ?? email,
            first_name: ADMIN_FIRST_NAME,
            last_name: ADMIN_LAST_NAME,
            role: 'admin',
          },
          { onConflict: 'id' }
        )
      if (profileError) {
        console.error('Profile update failed:', profileError.message)
        process.exit(1)
      }
      console.log('Existing user updated to admin.')
      console.log('\nLogin with:', email, '/ (your existing password)')
      return
    }
    console.error('Create user error:', createError.message)
    process.exit(1)
  }

  if (!newUser.user) {
    console.error('User creation returned no user')
    process.exit(1)
  }

  const { error: profileError } = await adminClient
    .from('user_profiles')
    .upsert(
      {
        id: newUser.user.id,
        email: newUser.user.email ?? email,
        first_name: ADMIN_FIRST_NAME,
        last_name: ADMIN_LAST_NAME,
        role: 'admin',
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('Profile insert failed:', profileError.message)
    process.exit(1)
  }

  // Allow this email to sign up (in case they need to re-register later)
  await adminClient.from('allowed_signup_emails').upsert(
    { email },
    { onConflict: 'email' }
  )

  console.log('\nAdmin user created successfully.')
  console.log('Email:', email)
  console.log('Password:', ADMIN_PASSWORD)
  console.log('\nLog in at your app login page, then go to /dashboard/admin')
}

seedAdmin().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

/** Server client with anon key; uses cookies for auth when available. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in Route Handlers
          }
        },
      },
    }
  )
}

/** Get current user from cookies or from Authorization: Bearer <token> (client stores session in localStorage). */
export async function getAuthUser(request?: Request | null): Promise<User | null> {
  const supabase = await createClient()
  const token = request?.headers?.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) return user
  }
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

/** Server-only client with service role; bypasses RLS. Use only for trusted server-side reads (e.g. checking user role). */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for createServiceRoleClient')
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

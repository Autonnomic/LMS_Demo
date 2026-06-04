import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { getSupabasePublicKey } from '@/lib/supabase'

/** Server client with anon key; uses cookies for auth when available. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
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

/**
 * Server-side DB client for API routes.
 * Uses service role when set; otherwise publishable/anon (works when RLS is off).
 * When the project uses new `sb_publishable_*` keys, a stale/invalid JWT service_role
 * in .env.local is skipped so routes do not fail with "Invalid API key".
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const publicKey = getSupabasePublicKey()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const useServiceRole =
    !!serviceKey &&
    !publicKey.startsWith('sb_publishable') &&
    serviceKey.startsWith('eyJ')
  const key = useServiceRole ? serviceKey! : publicKey
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

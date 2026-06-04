import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Supabase public (anon / publishable) key from env. */
export function getSupabasePublicKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add one in .env.local or Vercel environment variables.'
    )
  }
  return key
}

/**
 * Browser/client singleton. Lazy-init so importing this module does not call
 * `createClient` during Next.js prerender (where env may be unavailable or not
 * needed yet). Real usage happens in useEffect / event handlers on the client.
 */
let _client: SupabaseClient | undefined

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = url ? getSupabasePublicKey() : undefined
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Vercel → Project → Settings → Environment Variables (Production and Preview).'
    )
  }
  _client = createClient(url, key)
  return _client
}

/** Same as `getSupabaseBrowserClient()` but keeps existing `import { supabase }` usage. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseBrowserClient()
    const value = Reflect.get(client as object, prop, receiver)
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client)
    }
    return value
  },
})

import { supabase } from '@/lib/supabase'

/**
 * Log out and clear the stored session so the user can log in again from another device.
 * Call this instead of supabase.auth.signOut() so single-session tracking is cleared.
 */
export async function logout(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      await fetch('/api/auth/clear-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: 'include',
      })
    }
  } catch {
    // ignore
  }
  await supabase.auth.signOut()
}

/** PostgREST / Postgres errors when a table or schema is not deployed yet. */
export function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = error.message ?? ''
  return (
    error.code === 'PGRST205' ||
    msg.includes('Could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  )
}

import { NextResponse } from 'next/server'

/** Chrome DevTools probes this path; return empty JSON to avoid 404. */
export async function GET() {
  return NextResponse.json({})
}

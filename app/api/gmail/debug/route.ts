import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gmail/debug
 * Temporary diagnostic for the Gmail token store. Reports whether the Upstash
 * env vars are visible at runtime and whether a real SET/GET round-trip works.
 * DELETE THIS ROUTE once the connector is confirmed working — it exposes store
 * health and should not ship in production.
 */
export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  const report: Record<string, unknown> = {
    urlPresent: Boolean(url),
    tokenPresent: Boolean(token),
    urlHost: url ? safeHost(url) : null,
    tokenLength: token ? token.length : 0,
  }

  if (!url || !token) {
    report.verdict = 'MISSING_ENV — one or both Upstash vars are not visible at runtime'
    return NextResponse.json(report, { status: 200 })
  }

  const testKey = 'entwin:debug:ping'
  const testVal = `ok-${Date.now()}`

  try {
    // SET
    const setRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', testKey, testVal, 'EX', 60]),
    })
    report.setStatus = setRes.status
    const setJson = await setRes.json().catch(() => null)
    report.setBody = setJson

    // GET
    const getRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', testKey]),
    })
    report.getStatus = getRes.status
    const getJson = (await getRes.json().catch(() => null)) as { result?: unknown } | null
    report.getBody = getJson
    report.roundTripOk = getJson?.result === testVal
    report.verdict = report.roundTripOk
      ? 'OK — Redis SET/GET round-trip works; token store is healthy'
      : 'REDIS_MISMATCH — round-trip did not return the written value (check URL/token pair)'
  } catch (e) {
    report.verdict = 'REDIS_ERROR'
    report.error = (e as Error).message
  }

  return NextResponse.json(report, { status: 200 })
}

function safeHost(u: string): string {
  try {
    return new URL(u).host
  } catch {
    return 'unparseable-url'
  }
}

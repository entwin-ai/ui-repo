import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isGmailCard } from '@/lib/gmail/route-helpers'
import { disconnect } from '@/lib/gmail/service'

export const dynamic = 'force-dynamic'

/** POST /api/gmail/disconnect  { card: "gmail-personal" } */
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { card } = await req.json().catch(() => ({}))
  if (!isGmailCard(card)) {
    return NextResponse.json({ error: 'Invalid or missing card id' }, { status: 400 })
  }
  await disconnect(auth.email, card)
  return NextResponse.json({ ok: true })
}

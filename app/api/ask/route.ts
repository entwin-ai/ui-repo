import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isGmailCard } from '@/lib/gmail/route-helpers'
import { ask } from '@/lib/rag/query'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ask  { question: string, card?: "gmail-personal" | "gmail-professional" }
 *
 * Retrieval-augmented answer over the signed-in user's email memory. The
 * user_email comes from the NextAuth session; retrieval is hard-scoped to it,
 * so no other user's notes are reachable. `card` optionally narrows to one
 * mailbox.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { question, card } = await req.json().catch(() => ({}))
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }
  const cardId = isGmailCard(card) ? card : null

  try {
    const result = await ask(auth.email, question, cardId)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

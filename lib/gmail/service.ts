/**
 * Gmail connector service (server-side singleton).
 *
 * What it does
 * ------------
 * Entwin reads a user's Gmail so the vault always knows their pending
 * activities, upcoming appointments, and who they still owe a reply. To do
 * that it needs the read-only Gmail scope, which is *incremental*: the base
 * NextAuth login only asks for `openid email profile`, and we request the
 * heavier `gmail.readonly` scope separately, at the moment the user clicks
 * "Connect" on a Gmail card. That keeps the initial sign-in lightweight and
 * only asks for mailbox access when the user actually opts in.
 *
 * The consent flow (per Gmail card):
 *   1. UI hits /api/gmail/authorize -> we build a Google consent URL with
 *      prompt=select_account+consent so the account chooser appears, and
 *      redirect the browser to accounts.google.com.
 *   2. Google redirects back to /api/gmail/callback with a code.
 *   3. We exchange the code for tokens and store them per (user, cardId).
 *   4. UI hits /api/gmail/scan, which walks the last 12 months of INBOX and
 *      SENT, de-duplicates by RFC822 Message-Id, and returns the two counts.
 *
 * We deliberately do NOT save email bodies here — per the current spec we
 * only *parse and count* the last year (inbox + sent), deduplicated. The
 * token is what persists; message content is streamed through and discarded.
 *
 * Storage: tokens live in an in-memory map keyed by the signed-in email plus
 * the connector card id ("gmail-personal" / "gmail-professional"), so a user
 * can wire two different Google accounts to the two Gmail cards. For a
 * prototype an in-memory store is fine; a real deployment would persist these
 * encrypted at rest.
 */

import crypto from 'crypto'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** One year of mail, expressed the way Gmail search wants it. */
function oneYearAgoQuery(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  // Gmail's newer_than:1y also works, but an explicit after: date is clearer.
  return `after:${y}/${m}/${day}`
}

export type GmailState = 'disconnected' | 'authorizing' | 'connected'

export interface GmailScanResult {
  inboxCount: number
  sentCount: number
  scannedAt: number
}

interface GmailSession {
  state: GmailState
  connectedEmail?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number // unix ms
  scan?: GmailScanResult
}

/** Key = `${userEmail}::${cardId}` so two Gmail cards can hold two accounts. */
const sessions = new Map<string, GmailSession>()

/** Pending OAuth flows, keyed by the opaque `state` param we send to Google. */
interface PendingFlow {
  userEmail: string
  cardId: string
  createdAt: number
}
const pending = new Map<string, PendingFlow>()

function keyFor(userEmail: string, cardId: string): string {
  return `${userEmail}::${cardId}`
}

function getSession(userEmail: string, cardId: string): GmailSession {
  const k = keyFor(userEmail, cardId)
  let s = sessions.get(k)
  if (!s) {
    s = { state: 'disconnected' }
    sessions.set(k, s)
  }
  return s
}

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/gmail/callback`
}

/** Build the Google consent URL and register the pending flow. */
export function buildAuthUrl(userEmail: string, cardId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')

  const state = crypto.randomBytes(24).toString('hex')
  pending.set(state, { userEmail, cardId, createdAt: Date.now() })

  const getSess = getSession(userEmail, cardId)
  getSess.state = 'authorizing'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    // Ask for Gmail read on top of the identity we already have.
    scope: `openid email ${GMAIL_SCOPE}`,
    // select_account => the Google account chooser; consent => always show
    // the permissions screen so the user explicitly grants mailbox reading.
    prompt: 'select_account consent',
    access_type: 'offline', // get a refresh token so scans can run later
    include_granted_scopes: 'true',
    state,
  })
  return `${OAUTH_AUTH_URL}?${params.toString()}`
}

/** Exchange the OAuth code for tokens and attach them to the card session. */
export async function handleCallback(
  code: string,
  state: string,
): Promise<{ userEmail: string; cardId: string }> {
  const flow = pending.get(state)
  if (!flow) throw new Error('Unknown or expired OAuth state')
  pending.delete(state)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Google OAuth env vars are not set')

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  })

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Token exchange failed: ${res.status} ${detail}`)
  }
  const tok = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    id_token?: string
  }

  // Which Google account did they actually pick? Ask the userinfo endpoint.
  let connectedEmail: string | undefined
  try {
    const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    if (ui.ok) connectedEmail = ((await ui.json()) as { email?: string }).email
  } catch {
    /* non-fatal */
  }

  const sess = getSession(flow.userEmail, flow.cardId)
  sess.state = 'connected'
  sess.accessToken = tok.access_token
  if (tok.refresh_token) sess.refreshToken = tok.refresh_token
  sess.expiresAt = Date.now() + tok.expires_in * 1000
  sess.connectedEmail = connectedEmail

  return { userEmail: flow.userEmail, cardId: flow.cardId }
}

/** Make sure we have a non-expired access token, refreshing if needed. */
async function ensureAccessToken(sess: GmailSession): Promise<string> {
  if (sess.accessToken && sess.expiresAt && Date.now() < sess.expiresAt - 60_000) {
    return sess.accessToken
  }
  if (!sess.refreshToken) {
    if (sess.accessToken) return sess.accessToken // best effort
    throw new Error('No valid Gmail token; reconnect required')
  }
  const clientId = process.env.GOOGLE_CLIENT_ID as string
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET as string
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: sess.refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error('Failed to refresh Gmail token')
  const tok = (await res.json()) as { access_token: string; expires_in: number }
  sess.accessToken = tok.access_token
  sess.expiresAt = Date.now() + tok.expires_in * 1000
  return sess.accessToken
}

/**
 * Count messages in one Gmail label over the last year, de-duplicated by the
 * RFC822 Message-Id header. We page through messages.list, then fetch just the
 * Message-Id header per message (format=metadata) and add it to a Set. Gmail
 * thread quirks and forwarded copies can surface the same message twice; the
 * Set collapses those to a single logical email.
 */
async function countLabelDeduped(
  accessToken: string,
  labelId: 'INBOX' | 'SENT',
  seen: Set<string>,
): Promise<number> {
  const q = oneYearAgoQuery()
  let pageToken: string | undefined
  let added = 0

  do {
    const listUrl = new URL(`${GMAIL_API}/messages`)
    listUrl.searchParams.set('labelIds', labelId)
    listUrl.searchParams.set('q', q)
    listUrl.searchParams.set('maxResults', '500')
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken)

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!listRes.ok) {
      const detail = await listRes.text().catch(() => '')
      throw new Error(`Gmail list failed (${labelId}): ${listRes.status} ${detail}`)
    }
    const page = (await listRes.json()) as {
      messages?: { id: string }[]
      nextPageToken?: string
    }
    pageToken = page.nextPageToken

    const ids = page.messages ?? []
    // Fetch Message-Id headers in bounded-concurrency batches so we can dedup.
    const BATCH = 20
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH)
      const headers = await Promise.all(
        slice.map(async ({ id }) => {
          const mUrl = new URL(`${GMAIL_API}/messages/${id}`)
          mUrl.searchParams.set('format', 'metadata')
          mUrl.searchParams.append('metadataHeaders', 'Message-Id')
          const mRes = await fetch(mUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!mRes.ok) return { id, messageId: undefined as string | undefined }
          const msg = (await mRes.json()) as {
            payload?: { headers?: { name: string; value: string }[] }
          }
          const hdr = msg.payload?.headers?.find(
            (h) => h.name.toLowerCase() === 'message-id',
          )
          return { id, messageId: hdr?.value }
        }),
      )
      for (const h of headers) {
        // Dedup key: prefer the RFC822 Message-Id; fall back to Gmail's id.
        const key = (h.messageId || h.id).trim()
        if (!seen.has(key)) {
          seen.add(key)
          added += 1
        }
      }
    }
  } while (pageToken)

  return added
}

/** Parse the last year of inbox + sent, deduplicated, and cache the counts. */
export async function scan(userEmail: string, cardId: string): Promise<GmailScanResult> {
  const sess = getSession(userEmail, cardId)
  if (sess.state !== 'connected') throw new Error('Gmail is not connected for this card')
  const accessToken = await ensureAccessToken(sess)

  // Separate Sets so inbox and sent are counted independently, but each set is
  // internally deduplicated (a threaded message counted once within its label).
  const inboxSeen = new Set<string>()
  const sentSeen = new Set<string>()

  const inboxCount = await countLabelDeduped(accessToken, 'INBOX', inboxSeen)
  const sentCount = await countLabelDeduped(accessToken, 'SENT', sentSeen)

  const result: GmailScanResult = { inboxCount, sentCount, scannedAt: Date.now() }
  sess.scan = result
  return result
}

export interface GmailStatus {
  state: GmailState
  connectedEmail: string | null
  scan: GmailScanResult | null
}

export function status(userEmail: string, cardId: string): GmailStatus {
  const sess = getSession(userEmail, cardId)
  return {
    state: sess.state,
    connectedEmail: sess.connectedEmail ?? null,
    scan: sess.scan ?? null,
  }
}

export function disconnect(userEmail: string, cardId: string): void {
  sessions.delete(keyFor(userEmail, cardId))
}

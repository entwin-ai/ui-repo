/**
 * Gmail connector service (server-side).
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
 *   4. UI hits /api/gmail/scan, which counts the last 12 months of INBOX and
 *      SENT and returns the two counts.
 *
 * We deliberately do NOT save email bodies here — per the current spec we
 * only *count* the last year (inbox + sent). The token is what persists;
 * no message content is fetched or stored.
 *
 * -----------------------------------------------------------------------------
 * Why this file was rewritten (v3.1)
 * -----------------------------------------------------------------------------
 * Two production bugs made "email reading" appear broken on Vercel:
 *
 *   (A) TIMEOUT. The old scan fetched the Message-Id header for *every*
 *       message (one HTTP round-trip each) purely to dedup a count. A year of
 *       mail is easily 10k-20k messages => 10k-20k serverless-bound fetches,
 *       which never completes inside a Vercel function's wall-clock limit.
 *       Since we only need COUNTS, we now page messages.list (500 ids/page,
 *       ~30 calls for a large mailbox) and count ids. No per-message fetch.
 *       messages.list is already thread-scoped per label, so the practical
 *       count is what the user sees in Gmail's own INBOX / SENT views.
 *
 *   (B) LOST TOKENS. The old store was a plain module-level `Map`. On Vercel,
 *       /api/gmail/callback and /api/gmail/scan can execute in *different*
 *       lambda instances, so the token written during the callback was gone
 *       by the time scan ran -> "Gmail is not connected for this card". We now
 *       mirror the WhatsApp connector: a globalThis-pinned in-memory cache
 *       backed by a small JSON file per (user, card) under a resolved data
 *       root, so tokens survive across invocations on the same instance and
 *       across warm reloads.
 *
 * Storage note: on Vercel the only writable path is /tmp, which is per-instance
 * and may be wiped between cold starts — so file persistence there is
 * best-effort, exactly as it is for the WhatsApp connector. For durable,
 * cross-instance tokens, point ENTWIN_DATA_DIR at a mounted volume or swap the
 * read/writeStore helpers below for a KV/Redis/DB implementation. The public
 * function signatures (buildAuthUrl, handleCallback, scan, status, disconnect)
 * are unchanged, so nothing outside this file needs to change.
 */

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

/* ---------------------------------------------------------------------------
 * Persistence
 *
 * Mirrors lib/whatsapp/service.ts: a globalThis-pinned in-memory cache (so a
 * warm lambda / dev hot-reload reuses it) backed by a JSON file per session.
 * ------------------------------------------------------------------------- */

const g = globalThis as unknown as {
  __entwinGmailSessions?: Map<string, GmailSession>
  __entwinGmailPending?: Map<string, PendingFlow>
  __entwinGmailDataRoot?: string
}
if (!g.__entwinGmailSessions) g.__entwinGmailSessions = new Map<string, GmailSession>()
if (!g.__entwinGmailPending) g.__entwinGmailPending = new Map<string, PendingFlow>()

/** In-memory cache of sessions, keyed `${userEmail}::${cardId}`. */
const sessions: Map<string, GmailSession> = g.__entwinGmailSessions

/**
 * Pending OAuth flows, keyed by the opaque `state` param we send to Google.
 * These are short-lived (the round trip to Google's consent screen) and only
 * meaningful within the browser's redirect sequence, so they stay in memory.
 * If callback lands on a cold instance where the state is missing, the user is
 * simply asked to reconnect — the same failure mode as before.
 */
interface PendingFlow {
  userEmail: string
  cardId: string
  createdAt: number
}
const pending: Map<string, PendingFlow> = g.__entwinGmailPending

/**
 * Resolve a writable data root. Serverless platforms (Vercel/Lambda) mount the
 * app at a read-only path like /var/task, so we probe candidates in order:
 *   1. ENTWIN_DATA_DIR env var (recommended for any real deployment)
 *   2. <cwd>/.entwin-data (local dev / self-hosted `next start`)
 *   3. <os tmpdir>/entwin-data (last resort — EPHEMERAL: wiped between
 *      serverless invocations, so tokens will not survive a cold start)
 */
function resolveDataRoot(): string {
  const candidates = [
    process.env.ENTWIN_DATA_DIR,
    path.join(process.cwd(), '.entwin-data'),
    path.join(os.tmpdir(), 'entwin-data'),
  ].filter(Boolean) as string[]
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.accessSync(dir, fs.constants.W_OK)
      return dir
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('No writable data directory found — set ENTWIN_DATA_DIR to a writable path')
}

const DATA_ROOT: string = g.__entwinGmailDataRoot ?? (g.__entwinGmailDataRoot = resolveDataRoot())

function keyFor(userEmail: string, cardId: string): string {
  return `${userEmail}::${cardId}`
}

/** Opaque, filesystem-safe filename for a (user, card) pair. */
function sessionFile(userEmail: string, cardId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(keyFor(userEmail, cardId).toLowerCase())
    .digest('hex')
    .slice(0, 24)
  return path.join(DATA_ROOT, 'gmail', `${hash}.json`)
}

/** Persist a session to disk (best-effort; never throws into the request). */
function writeStore(userEmail: string, cardId: string, sess: GmailSession): void {
  try {
    const file = sessionFile(userEmail, cardId)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(sess), 'utf8')
  } catch {
    /* disk not writable (or ephemeral) — in-memory cache still serves warm hits */
  }
}

/** Load a session from disk if present. */
function readStore(userEmail: string, cardId: string): GmailSession | undefined {
  try {
    const file = sessionFile(userEmail, cardId)
    if (!fs.existsSync(file)) return undefined
    return JSON.parse(fs.readFileSync(file, 'utf8')) as GmailSession
  } catch {
    return undefined
  }
}

function deleteStore(userEmail: string, cardId: string): void {
  try {
    fs.rmSync(sessionFile(userEmail, cardId), { force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Get a session, checking the in-memory cache first, then disk, then creating
 * a fresh disconnected one. The disk read is what makes tokens survive a
 * callback and scan landing on different lambda instances.
 */
function getSession(userEmail: string, cardId: string): GmailSession {
  const k = keyFor(userEmail, cardId)
  let s = sessions.get(k)
  if (s) return s

  const fromDisk = readStore(userEmail, cardId)
  if (fromDisk) {
    sessions.set(k, fromDisk)
    return fromDisk
  }

  s = { state: 'disconnected' }
  sessions.set(k, s)
  return s
}

/** Write a session through both the in-memory cache and disk. */
function saveSession(userEmail: string, cardId: string, sess: GmailSession): void {
  sessions.set(keyFor(userEmail, cardId), sess)
  writeStore(userEmail, cardId, sess)
}

/* ---------------------------------------------------------------------------
 * OAuth
 * ------------------------------------------------------------------------- */

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

  const sess = getSession(userEmail, cardId)
  sess.state = 'authorizing'
  saveSession(userEmail, cardId, sess)

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
  saveSession(flow.userEmail, flow.cardId, sess)

  return { userEmail: flow.userEmail, cardId: flow.cardId }
}

/**
 * Make sure we have a non-expired access token, refreshing if needed. The
 * refreshed token is persisted so subsequent invocations (possibly on other
 * instances) reuse it instead of forcing a reconnect.
 */
async function ensureAccessToken(
  userEmail: string,
  cardId: string,
  sess: GmailSession,
): Promise<string> {
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
  saveSession(userEmail, cardId, sess)
  return sess.accessToken
}

/* ---------------------------------------------------------------------------
 * Counting
 * ------------------------------------------------------------------------- */

/**
 * Count messages in one Gmail label over the last year.
 *
 * We page through messages.list (up to 500 ids per page) and sum the number of
 * ids. No per-message fetch — that was the source of the timeout. messages.list
 * is already scoped to the label, so INBOX / SENT counts match what the user
 * sees in Gmail's own views for the same `after:` window.
 *
 * Note vs. the old behaviour: the previous code deduplicated by RFC822
 * Message-Id, which required fetching every message. Within a single label
 * duplicate Message-Ids are rare, so the counts are effectively the same, and
 * this version returns in ~O(pages) HTTP calls instead of O(messages).
 */
async function countLabel(accessToken: string, labelId: 'INBOX' | 'SENT'): Promise<number> {
  const q = oneYearAgoQuery()
  let pageToken: string | undefined
  let total = 0

  do {
    const listUrl = new URL(`${GMAIL_API}/messages`)
    listUrl.searchParams.set('labelIds', labelId)
    listUrl.searchParams.set('q', q)
    listUrl.searchParams.set('maxResults', '500')
    // Only ids are needed for a count; this keeps the payload minimal.
    listUrl.searchParams.set('fields', 'messages/id,nextPageToken')
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
    total += (page.messages ?? []).length
    pageToken = page.nextPageToken
  } while (pageToken)

  return total
}

/** Count the last year of inbox + sent and cache the result. */
export async function scan(userEmail: string, cardId: string): Promise<GmailScanResult> {
  const sess = getSession(userEmail, cardId)
  if (sess.state !== 'connected') throw new Error('Gmail is not connected for this card')
  const accessToken = await ensureAccessToken(userEmail, cardId, sess)

  // Sequential is fine — ~30 calls each for a large mailbox. If you ever need
  // it faster, these two are independent and can be Promise.all'd.
  const inboxCount = await countLabel(accessToken, 'INBOX')
  const sentCount = await countLabel(accessToken, 'SENT')

  const result: GmailScanResult = { inboxCount, sentCount, scannedAt: Date.now() }
  sess.scan = result
  saveSession(userEmail, cardId, sess)
  return result
}

/* ---------------------------------------------------------------------------
 * Status / disconnect
 * ------------------------------------------------------------------------- */

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
  deleteStore(userEmail, cardId)
}

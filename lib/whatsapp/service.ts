/**
 * WhatsApp connector service (server-side singleton).
 *
 * How it works
 * ------------
 * WhatsApp chats are end-to-end encrypted, so a phone number alone cannot
 * unlock anyone's messages. Instead, Entwin registers itself as a *linked
 * device* on the user's own account (same mechanism as WhatsApp Web/Desktop):
 *
 *   1. The user enters their mobile number in the UI.
 *   2. We open a Baileys socket and request an 8-character pairing code.
 *   3. The user types that code into WhatsApp -> Settings -> Linked devices.
 *   4. From then on this process receives the chat history sync plus every
 *      new incoming/outgoing message in real time.
 *
 * Messages are buffered in memory and flushed ("synced") into a per-user
 * JSONL vault file. A poll timer flushes every 15 minutes; the UI can also
 * trigger a manual "Sync now".
 *
 * NOTE: Baileys speaks the WhatsApp Web protocol but is not an official
 * client. Fine for a prototype; for production weigh the ToS / ban risk and
 * keep behaviour passive (read-only, no bulk sending).
 */

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const SYNC_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export type WaState = 'disconnected' | 'pairing' | 'connected'

export interface VaultMessage {
  id: string
  chatId: string
  chatName?: string
  sender?: string
  fromMe: boolean
  timestamp: number // unix seconds
  text: string
}

interface UserSession {
  sock?: WASocket
  state: WaState
  phone?: string
  pairingCode?: string
  buffer: VaultMessage[]
  seenIds: Set<string>
  messageCount: number // total ever ingested to vault + buffered
  lastSync?: number // unix ms
  pollEnabled: boolean
  pollTimer?: ReturnType<typeof setInterval>
  lastError?: string
  stopping?: boolean
}

// Survive Next.js dev-mode hot reloads
const g = globalThis as any
if (!g.__entwinWaSessions) g.__entwinWaSessions = new Map<string, UserSession>()
const sessions: Map<string, UserSession> = g.__entwinWaSessions

const DATA_ROOT = path.join(process.cwd(), '.entwin-data')
const logger = pino({ level: 'silent' })

function userKey(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
}
function authDir(key: string) {
  return path.join(DATA_ROOT, 'wa-auth', key)
}
function vaultFile(key: string) {
  return path.join(DATA_ROOT, 'vault', `${key}-whatsapp.jsonl`)
}

function getSession(key: string): UserSession {
  let s = sessions.get(key)
  if (!s) {
    s = { state: 'disconnected', buffer: [], seenIds: new Set(), messageCount: 0, pollEnabled: true }
    sessions.set(key, s)
  }
  return s
}

/** Pull readable text out of the many WhatsApp message shapes. */
function extractText(m: WAMessage): string {
  const msg: any = m.message
  if (!msg) return ''
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.ephemeralMessage?.message?.conversation ||
    msg.ephemeralMessage?.message?.extendedTextMessage?.text ||
    ''
  )
}

function toVaultMessage(m: WAMessage): VaultMessage | null {
  const text = extractText(m)
  if (!text) return null // skip media-only / protocol messages for now
  const key = m.key
  if (!key?.id || !key.remoteJid) return null
  if (key.remoteJid === 'status@broadcast') return null
  const ts = typeof m.messageTimestamp === 'number' ? m.messageTimestamp : Number(m.messageTimestamp || 0)
  return {
    id: key.id,
    chatId: key.remoteJid,
    chatName: m.pushName || undefined,
    sender: key.participant || key.remoteJid,
    fromMe: !!key.fromMe,
    timestamp: ts,
    text,
  }
}

function ingest(s: UserSession, msgs: WAMessage[]) {
  for (const m of msgs) {
    const vm = toVaultMessage(m)
    if (!vm || s.seenIds.has(vm.id)) continue
    s.seenIds.add(vm.id)
    s.buffer.push(vm)
    s.messageCount++
  }
}

/** Flush buffered messages to the on-disk vault. Returns count written. */
export function syncNow(email: string): { written: number; lastSync: number } {
  const key = userKey(email)
  const s = getSession(key)
  const file = vaultFile(key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const written = s.buffer.length
  if (written > 0) {
    const lines = s.buffer.map((m) => JSON.stringify(m)).join('\n') + '\n'
    fs.appendFileSync(file, lines, 'utf8')
    s.buffer = []
  }
  s.lastSync = Date.now()
  return { written, lastSync: s.lastSync }
}

function startPollTimer(email: string) {
  const s = getSession(userKey(email))
  if (s.pollTimer) return
  s.pollTimer = setInterval(() => {
    if (s.pollEnabled && s.state === 'connected') {
      try {
        syncNow(email)
      } catch (e) {
        s.lastError = `sync failed: ${(e as Error).message}`
      }
    }
  }, SYNC_INTERVAL_MS)
  // Don't keep the process alive just for the timer
  ;(s.pollTimer as any)?.unref?.()
}

export function setPolling(email: string, enabled: boolean) {
  const s = getSession(userKey(email))
  s.pollEnabled = enabled
  if (enabled) startPollTimer(email)
}

/**
 * Start (or resume) a WhatsApp session for this user and, if the device is
 * not yet registered, request a pairing code for the given phone number.
 * Phone must be digits only, country code included (e.g. 13125551234).
 */
export async function connect(email: string, phone: string): Promise<{ state: WaState; pairingCode?: string }> {
  const key = userKey(email)
  const s = getSession(key)

  if (s.sock && s.state === 'connected') {
    return { state: s.state }
  }

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Enter the number in international format, e.g. +1 312 555 1234')
  }
  s.phone = digits
  s.lastError = undefined
  s.stopping = false

  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir(key))
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false, // stay passive: don't affect the user's presence
    syncFullHistory: true, // ask the phone for as much history as it will give
    browser: ['Entwin', 'Desktop', '2.0.0'],
  })
  s.sock = sock
  s.state = 'pairing'

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'open') {
      s.state = 'connected'
      s.pairingCode = undefined
      startPollTimer(email)
    } else if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (s.stopping || code === DisconnectReason.loggedOut) {
        s.state = 'disconnected'
        s.sock = undefined
      } else {
        // transient drop — reconnect with saved creds
        s.state = 'pairing'
        connect(email, digits).catch((e) => {
          s.lastError = (e as Error).message
          s.state = 'disconnected'
        })
      }
    }
  })

  // Chat history the phone pushes after linking
  sock.ev.on('messaging-history.set', ({ messages }) => ingest(s, messages))
  // Live messages (incoming and the user's own outgoing)
  sock.ev.on('messages.upsert', ({ messages }) => ingest(s, messages))

  // If this device isn't registered yet, ask for a pairing code
  if (!authState.creds.registered) {
    await new Promise((r) => setTimeout(r, 2500)) // let the socket settle
    const code = await sock.requestPairingCode(digits)
    s.pairingCode = code.match(/.{1,4}/g)?.join('-') ?? code
  }

  return { state: s.state, pairingCode: s.pairingCode }
}

export async function disconnect(email: string): Promise<void> {
  const key = userKey(email)
  const s = getSession(key)
  s.stopping = true
  if (s.pollTimer) {
    clearInterval(s.pollTimer)
    s.pollTimer = undefined
  }
  try {
    // flush anything still buffered before tearing down
    syncNow(email)
  } catch {}
  try {
    await s.sock?.logout()
  } catch {}
  try {
    s.sock?.end(undefined)
  } catch {}
  s.sock = undefined
  s.state = 'disconnected'
  s.pairingCode = undefined
  s.buffer = []
  s.seenIds = new Set()
  s.messageCount = 0
  // remove device credentials — the link is revoked
  fs.rmSync(authDir(key), { recursive: true, force: true })
}

export function status(email: string) {
  const key = userKey(email)
  const s = getSession(key)
  return {
    state: s.state,
    phone: s.phone,
    pairingCode: s.state === 'pairing' ? s.pairingCode : undefined,
    pollEnabled: s.pollEnabled,
    pendingMessages: s.buffer.length,
    totalMessages: s.messageCount,
    lastSync: s.lastSync ?? null,
    error: s.lastError,
  }
}

/** Most recent vault messages (for a quick preview in the UI). */
export function recentMessages(email: string, limit = 20): VaultMessage[] {
  const key = userKey(email)
  const s = getSession(key)
  const fromBuffer = s.buffer.slice(-limit)
  if (fromBuffer.length >= limit) return fromBuffer
  const file = vaultFile(key)
  let fromDisk: VaultMessage[] = []
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
    fromDisk = lines
      .slice(-(limit - fromBuffer.length))
      .map((l) => {
        try {
          return JSON.parse(l) as VaultMessage
        } catch {
          return null
        }
      })
      .filter(Boolean) as VaultMessage[]
  }
  return [...fromDisk, ...fromBuffer].slice(-limit)
}

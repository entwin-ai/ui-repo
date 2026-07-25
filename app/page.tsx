'use client'

/*
 * Entwin frontend — screens ported from entwin_frontend_v3.html.
 * Navigation is reproduced exactly. Google authentication is the only wired
 * behavior (real NextAuth Google OAuth). Every other screen is static /
 * local-only, matching the reference HTML prototype.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { LOGO_DATA_URI } from './logo'

type ViewKey = 'chat' | 'connectors' | 'dashboard' | 'memory' | 'settings'
type DashTab = 'overview' | 'kanban' | 'entities'
type ListKey = 'marketing' | 'updates' | 'people'
type ProviderKey = 'claude' | 'gemini' | 'openai' | 'neocloud' | 'onprem'

/* ---------------- Static data (from v3 HTML) ---------------- */

const MODELS = [
  { name: 'Claude Opus 4.8', desc: 'Most capable, best for complex work' },
  { name: 'Claude Sonnet 5', desc: 'Balanced for everyday use' },
  { name: 'Claude Haiku 4.5', desc: 'Fastest, best for quick tasks' },
]

const BRAND_ICONS: Record<string, JSX.Element> = {
  gmail: (
    <svg viewBox="0 0 48 48">
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <path fill="#e53935" d="M35,11.2l-11,8.25l-11-8.25L12,17l11,8.25L34,17L35,11.2z" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8H7C4.791,8,3,9.791,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8H41C43.209,8,45,9.791,45,12.298z" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 87.3 78">
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" />
      <path fill="#00832d" d="M43.65 25L57.4 1.2C56.05 0.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="M73.4 26.5L60.1 3.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="18" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="1" />
      <rect x="2.5" y="4.5" width="19" height="5" fill="#1a73e8" />
      <text x="12" y="17.5" fontSize="9.5" fontWeight="700" fill="#1a73e8" textAnchor="middle" fontFamily="Arial, sans-serif">31</text>
    </svg>
  ),
}

interface GmailScan {
  inboxCount: number
  sentCount: number
}

interface Connector {
  name: string
  service: string | null
  icon?: string
  code?: string
  desc: string
  connected: boolean
  connectedEmail: string | null
  // Gmail cards get a stable id used by the real OAuth + scan backend.
  cardId?: 'gmail-personal' | 'gmail-professional'
  // Local UI state for the Gmail read/parse flow.
  scanning?: boolean
  scan?: GmailScan | null
}

const INITIAL_CONNECTORS: Connector[] = [
  { name: 'Gmail — Personal', service: 'gmail', icon: 'gmail', cardId: 'gmail-personal', desc: 'Email ingestion for the vault.', connected: false, connectedEmail: null, scan: null },
  { name: 'Gmail — Professional', service: 'gmail', icon: 'gmail', cardId: 'gmail-professional', desc: 'Email ingestion for the vault.', connected: false, connectedEmail: null, scan: null },
  { name: 'Google Drive — Personal', service: 'drive', icon: 'drive', desc: 'Document ingestion for the vault.', connected: false, connectedEmail: null },
  { name: 'Google Drive — Professional', service: 'drive', icon: 'drive', desc: 'Document ingestion for the vault.', connected: false, connectedEmail: null },
  { name: 'Google Calendar', service: null, icon: 'calendar', desc: 'Meeting and scheduling context.', connected: false, connectedEmail: null },
  { name: 'WhatsApp', service: null, code: 'WA', desc: 'Personal messages, facet-decomposed.', connected: false, connectedEmail: null },
  { name: 'Telegram', service: null, code: 'TG', desc: 'Personal messages, facet-decomposed.', connected: false, connectedEmail: null },
  { name: 'Slack', service: null, code: 'SL', desc: 'Work channel ingestion.', connected: false, connectedEmail: null },
  { name: 'Browser history', service: null, code: 'BH', desc: 'Search activity as raw source.', connected: false, connectedEmail: null },
]

const LIST_LABELS: Record<ListKey, string> = { marketing: 'Marketing', updates: 'Updates', people: 'People' }

const MOVE_RULES: Record<string, string> = {
  'marketing>people': 'Backfill: a full Memory Note will be created for every past email from this sender, dated to when each was originally received.',
  'people>marketing': 'No deletion. Existing Memory Notes stand untouched. New mail from this sender will log into the Ignored Daily Note instead.',
  'marketing>updates': 'Backfill: Daily Updates Note entries will be created for every past email, inserted into each original date\u2019s daily note.',
  'updates>marketing': 'No deletion. Existing Daily Updates entries stand. New mail will log into the Ignored Daily Note instead.',
  'updates>people': 'Backfill: a full Memory Note will be created for every past email. Existing Daily Updates entries are not removed, both now exist side by side.',
  'people>updates': 'No deletion. Existing Memory Notes stand untouched. New mail will log into the Daily Updates Note instead (narrow LLM summary).',
}

interface Sender { id: string; name: string; email: string; list: ListKey; isNew: boolean }
const INITIAL_SENDERS: Sender[] = [
  { id: 's1', name: 'enews.merewards.sg', email: 'delights@enews.merewards.sg', list: 'marketing', isNew: true },
  { id: 's2', name: 'LinkedIn', email: 'noreply@linkedin.com', list: 'marketing', isNew: true },
  { id: 's3', name: 'XYZ Store', email: 'offers@xyz-store.com', list: 'marketing', isNew: false },
  { id: 's4', name: 'ICICI Bank', email: 'services@custcomm.icici.bank.in', list: 'updates', isNew: true },
  { id: 's5', name: 'DBS iBanking', email: 'ibanking.alert@dbs.com', list: 'updates', isNew: false },
  { id: 's6', name: 'Dave Navarro', email: 'dave.n@gmail.com', list: 'people', isNew: false },
  { id: 's7', name: 'Priya Menon', email: 'priya.menon@gmail.com', list: 'people', isNew: true },
  { id: 's8', name: 'Rajesh Iyer', email: 'r.iyer@entwin.ai', list: 'people', isNew: false },
]

interface Entity { id: string; name: string; candidateId: string; candidateName: string; confidence: number; noteId: string; flaggedDate: string; aliases: string }
const INITIAL_ENTITIES: Entity[] = [
  { id: 'e1', name: 'Dave N.', candidateId: 'person_davenavarro', candidateName: 'Dave Navarro', confidence: 72, noteId: 'note_0648', flaggedDate: '2026-07-18', aliases: 'DN, dave.n@gmail.com' },
  { id: 'e2', name: 'R. Iyer', candidateId: 'person_rajeshiyer', candidateName: 'Rajesh Iyer', confidence: 65, noteId: 'note_0651', flaggedDate: '2026-07-19', aliases: 'R. Iyer, r.iyer@entwin.ai' },
]

const PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  claude: ['Claude Opus 4.8 (latest)', 'Claude Sonnet 5 (latest)', 'Claude Haiku 4.5 (latest)'],
  gemini: ['Gemini 3.1 Pro (latest)', 'Gemini 3.6 Flash (latest)', 'Gemini 3.5 Flash-Lite (latest)'],
  openai: ['GPT-5.6 Sol (latest)', 'GPT-5.6 Terra (latest)', 'GPT-5.6 Luna (latest)'],
  neocloud: ['DeepSeek V4 Pro', 'GLM-5.2', 'Kimi K2.6'],
  onprem: ['Qwen 3.6 27B', 'Llama 4 Maverick', 'Gemma 4 27B'],
}
const SELF_HOSTED: Partial<Record<ProviderKey, boolean>> = { neocloud: true, onprem: true }

/* ---------------- Small SVG helpers ---------------- */

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
)

/* ---------------- Login screen (real Google OAuth) ---------------- */

function LoginScreen() {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const handleGoogle = () => {
    setBusy(true)
    // Real Google OAuth via NextAuth — redirects to accounts.google.com
    signIn('google', { callbackUrl: '/' })
  }

  const handleEmail = () => {
    setNote("Email sign-in isn't wired up in this prototype — use Google to continue.")
    setTimeout(() => setNote(''), 3000)
  }

  return (
    <div id="login-screen" style={{ display: 'flex' }}>
      <div className="login-card">
        <div className="login-logo-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={28} height={28} alt="" style={{ flexShrink: 0, objectFit: 'contain' }} />
          <span className="wordmark">Entwin</span>
        </div>
        <div className="login-title">Sign in</div>
        <div className="login-sub">Your second brain, wherever you left it.</div>

        <button className="google-btn" id="google-login-btn" onClick={handleGoogle} disabled={busy}>
          <GoogleG />
          <span>{busy ? 'Redirecting…' : 'Continue with Google'}</span>
        </button>

        <div className="login-divider">or</div>
        <button className="login-email-link" id="email-login-btn" onClick={handleEmail}>Continue with email</button>
        <div className="login-note" id="login-note">{note}</div>

        <div className="login-footer">By continuing, you agree to Entwin&apos;s Terms and acknowledge the Privacy Policy.</div>
      </div>
    </div>
  )
}

/* ---------------- Chat view ---------------- */

interface ChatMsg { role: 'user' | 'assistant'; text: string }

function ChatView({ currentModel, resetKey }: { currentModel: string; resetKey: number }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: 'Hi. This is a frontend check, not a live model — messages you send here are echoed locally so you can test the layout and interactions.' },
  ])
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resetKey > 0) setMessages([{ role: 'assistant', text: 'New chat started.' }])
  }, [resetKey])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const send = () => {
    const text = value.trim()
    if (!text) return
    setMessages((m) => [...m, { role: 'user', text }])
    setValue('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'assistant', text: `This is a placeholder reply from ${currentModel}. Connect a backend in Settings to get real answers from the vault.` }])
    }, 350)
  }

  return (
    <>
      <div id="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            <div className="role-label">{m.role === 'user' ? 'You' : 'Entwin'}</div>
            <div className="bubble">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="chat-input-wrap">
        <div className="chat-input-box">
          <textarea
            id="chat-input"
            ref={taRef}
            rows={1}
            placeholder="Message Entwin..."
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 160) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="send-btn" id="send-btn" aria-label="Send message" onClick={send}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
          </button>
        </div>
      </div>
    </>
  )
}

/* ---------------- Connectors view ---------------- */

function ConnectorsView({
  connectors,
  setConnectors,
  runGmailScan,
}: {
  connectors: Connector[]
  setConnectors: React.Dispatch<React.SetStateAction<Connector[]>>
  runGmailScan: (cardId: NonNullable<Connector['cardId']>) => void
}) {
  const isGmail = (c: Connector) => c.service === 'gmail' && !!c.cardId

  const toggle = (idx: number) => {
    const c = connectors[idx]

    // Gmail cards use the real OAuth + read/parse backend.
    if (isGmail(c)) {
      if (c.connected) {
        // Disconnect: clear the server-side token, then reset the card.
        fetch('/api/gmail/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card: c.cardId }),
        }).catch(() => {})
        setConnectors((prev) =>
          prev.map((x, i) =>
            i === idx ? { ...x, connected: false, connectedEmail: null, scan: null, scanning: false } : x,
          ),
        )
        return
      }
      // Connect: hand off to Google. This navigates the browser to the
      // account chooser + consent screen; on return the app auto-scans.
      window.location.href = `/api/gmail/authorize?card=${c.cardId}`
      return
    }

    // Everything else stays a local, static toggle (prototype behaviour).
    setConnectors((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x
        if (x.connected) return { ...x, connected: false, connectedEmail: null }
        return { ...x, connected: true, connectedEmail: x.service ? 'alex.whitmore@gmail.com' : null }
      }),
    )
  }

  return (
    <div id="connectors-grid">
      {connectors.map((c, idx) => {
        const gmail = isGmail(c)
        let statusText: string
        if (c.connected) {
          statusText = c.connectedEmail ? `Connected as ${c.connectedEmail}` : 'Connected'
        } else {
          statusText = 'Not connected'
        }

        // Buttons: Gmail scanning shows a disabled "Reading…" state.
        const btnLabel = c.scanning ? 'Reading…' : c.connected ? 'Disconnect' : 'Connect'

        return (
          <div className="connector-card" key={idx}>
            <div className="connector-top">
              {c.icon ? (
                <div className="connector-icon brand">{BRAND_ICONS[c.icon]}</div>
              ) : (
                <div className="connector-icon">{c.code}</div>
              )}
              <div className="connector-name">{c.name}</div>
            </div>
            <div className="connector-desc">{c.desc}</div>

            {/* Gmail read summary — small font, inbox + sent counts. */}
            {gmail && c.connected && (c.scanning || c.scan) && (
              <div className="gmail-scan-summary">
                {c.scanning ? (
                  <span className="gmail-scan-loading">Reading your last 12 months of mail…</span>
                ) : c.scan ? (
                  <>
                    <span>Inbox read: {c.scan.inboxCount.toLocaleString()} messages</span>
                    <span>Sent read: {c.scan.sentCount.toLocaleString()} messages</span>
                  </>
                ) : null}
              </div>
            )}

            <div className="connector-bottom">
              <span className={`connector-status ${c.connected ? 'connected' : 'off'}`}>{statusText}</span>
              <button
                className={`connect-toggle ${c.connected ? 'connected' : ''}`}
                onClick={() => toggle(idx)}
                disabled={c.scanning}
              >
                {btnLabel}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Dashboard view ---------------- */

function KanbanPanel() {
  const [senders, setSenders] = useState<Sender[]>(INITIAL_SENDERS)
  const [confirmed, setConfirmed] = useState(false)
  const [moveNote, setMoveNote] = useState('')
  const draggedId = useRef<string | null>(null)

  const drop = (listKey: ListKey) => {
    const id = draggedId.current
    if (!id) return
    const sender = senders.find((s) => s.id === id)
    if (sender && sender.list !== listKey) {
      const ruleKey = `${sender.list}>${listKey}`
      setMoveNote(`${sender.name}: ${MOVE_RULES[ruleKey]}`)
      setSenders((prev) => prev.map((s) => (s.id === id ? { ...s, list: listKey } : s)))
    }
    draggedId.current = null
  }

  return (
    <div className="dash-panel active" id="dash-kanban">
      {!confirmed && (
        <div className="kanban-banner" id="kanban-banner">
          <div className="kanban-banner-text">Reviewing the last 90 days from account connection. Drag any miscategorized sender to the right column before confirming.</div>
          <button className="kanban-confirm-btn" onClick={() => setConfirmed(true)}>Confirm classification</button>
        </div>
      )}
      <div className="kanban-board" id="kanban-board">
        {(['marketing', 'updates', 'people'] as ListKey[]).map((listKey) => {
          const cards = senders.filter((s) => s.list === listKey)
          return (
            <div
              className="kanban-column"
              key={listKey}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('drag-over')
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
              onDrop={(e) => {
                e.currentTarget.classList.remove('drag-over')
                drop(listKey)
              }}
            >
              <div className="kanban-column-header">
                <span>{LIST_LABELS[listKey]}</span>
                <span className="kanban-column-count">{cards.length}</span>
              </div>
              <div className="kanban-cards">
                {cards.map((s) => {
                  const isNew = s.isNew && !confirmed
                  return (
                    <div
                      className={`kanban-card${isNew ? ' is-new' : ''}`}
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        draggedId.current = s.id
                        e.currentTarget.classList.add('dragging')
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                    >
                      <div className="kanban-card-name">{s.name}</div>
                      <div className="kanban-card-email">{s.email}</div>
                      {isNew && <div className="kanban-card-new-tag">New</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className={`kanban-move-note${moveNote ? ' show' : ''}`} id="kanban-move-note">{moveNote}</div>
    </div>
  )
}

function EntitiesPanel({ entities, setEntities }: { entities: Entity[]; setEntities: React.Dispatch<React.SetStateAction<Entity[]>> }) {
  return (
    <div className="dash-panel active" id="dash-entities">
      <div className="section-heading">Pending review</div>
      <div id="entity-queue">
        {entities.length === 0 ? (
          <div className="entity-empty">No entities waiting for review.</div>
        ) : (
          entities.map((ent) => (
            <div className="entity-card-v1" key={ent.id}>
              <div className="entity-card-v1-top">
                <span className="entity-card-v1-name">{ent.name}</span>
                <span className="entity-card-v1-score">match {ent.confidence}% &rarr; {ent.candidateId}</span>
              </div>
              <div className="entity-card-v1-meta">From {ent.noteId}, flagged {ent.flaggedDate}</div>
              <div className="entity-card-v1-aliases">Aliases seen: {ent.aliases}</div>
              <div className="entity-card-v1-actions">
                <button className="entity-card-v1-btn approve" onClick={() => setEntities((p) => p.filter((e) => e.id !== ent.id))}>Merge into {ent.candidateId}</button>
                <button className="entity-card-v1-btn" onClick={() => setEntities((p) => p.filter((e) => e.id !== ent.id))}>Create as new entity</button>
                <button className="entity-card-v1-btn reject" onClick={() => setEntities((p) => p.filter((e) => e.id !== ent.id))}>Reject</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function OverviewPanel({ connectedCount, total, alertVisible, dismissAlert }: { connectedCount: number; total: number; alertVisible: boolean; dismissAlert: () => void }) {
  return (
    <div className="dash-panel active" id="dash-overview">
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card live">
          <div className="stat-value" id="sources-connected-value">{connectedCount} / {total}</div>
          <div className="stat-label">Sources connected</div>
          <div className="stat-sub">Live from Connectors.</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">0</div>
          <div className="stat-label">Notes indexed</div>
          <div className="stat-sub">Placeholder — future ingestion metric.</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">0</div>
          <div className="stat-label">Preferences learned</div>
          <div className="stat-sub">Placeholder — future personalization metric.</div>
        </div>
      </div>

      {alertVisible && (
        <div className="alert-card" id="deleted-alert-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <div>
            <div className="alert-title">1 Memory Note&apos;s source email was deleted</div>
            <div className="alert-desc">A message that produced a Memory Note was later removed from the mailbox. The note itself is untouched, but worth a look since this is flagged directly rather than left in a log.</div>
            <button className="alert-link" onClick={dismissAlert}>Mark as reviewed</button>
          </div>
        </div>
      )}

      <div className="section-heading">Ingestion volume, last 7 days</div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Ignore tier</div>
          <div className="stat-value">184</div>
          <div className="stat-sub">Marketing list senders, logged to the Ignored Daily Note</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Storage tier</div>
          <div className="stat-value">42</div>
          <div className="stat-sub">Updates list senders (banks, social, transactions)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Memory-worthy</div>
          <div className="stat-value">67</div>
          <div className="stat-sub">People list senders, full Memory Notes written</div>
        </div>
      </div>

      <div className="section-heading">Token spend, this month</div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Running cost</div>
          <div className="stat-value">$4.82</div>
          <div className="stat-breakdown">
            <div className="stat-breakdown-row"><span>write_note</span><span>$2.91</span></div>
            <div className="stat-breakdown-row"><span>extract_entities</span><span>$1.48</span></div>
            <div className="stat-breakdown-row"><span>summarize_update</span><span>$0.43</span></div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average latency</div>
          <div className="stat-value">1.1s</div>
          <div className="stat-breakdown">
            <div className="stat-breakdown-row"><span>write_note</span><span>1.4s</span></div>
            <div className="stat-breakdown-row"><span>extract_entities</span><span>0.9s</span></div>
            <div className="stat-breakdown-row"><span>summarize_update</span><span>0.6s</span></div>
          </div>
        </div>
      </div>

      <div className="section-heading">Entity growth, this week</div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">New entity files</div>
          <div className="stat-value">12</div>
          <div className="stat-sub">Created from a clean, no-match resolution</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Appended to existing</div>
          <div className="stat-value">34</div>
          <div className="stat-sub">Memory Note References added to a known Entity file</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open items</div>
          <div className="stat-value">7</div>
          <div className="stat-sub">Memory Notes whose action still includes await or decision</div>
        </div>
      </div>
    </div>
  )
}

function DashboardView({ connectedCount, total, entities, setEntities }: { connectedCount: number; total: number; entities: Entity[]; setEntities: React.Dispatch<React.SetStateAction<Entity[]>> }) {
  const [tab, setTab] = useState<DashTab>('overview')
  const [alertVisible, setAlertVisible] = useState(true)

  return (
    <>
      <div className="view-header">Dashboard<div className="sub">Ingestion stats, sender classification, and entity review</div></div>
      <div className="subtab-bar">
        <button className={`subtab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`subtab-btn${tab === 'kanban' ? ' active' : ''}`} onClick={() => setTab('kanban')}>Sender Kanban</button>
        <button className={`subtab-btn${tab === 'entities' ? ' active' : ''}`} onClick={() => setTab('entities')}>
          Entity Review{entities.length > 0 && <span className="subtab-badge" id="entity-badge">{entities.length}</span>}
        </button>
      </div>
      <div id="dashboard-body">
        {tab === 'overview' && <OverviewPanel connectedCount={connectedCount} total={total} alertVisible={alertVisible} dismissAlert={() => setAlertVisible(false)} />}
        {tab === 'kanban' && <KanbanPanel />}
        {tab === 'entities' && <EntitiesPanel entities={entities} setEntities={setEntities} />}
      </div>
    </>
  )
}

/* ---------------- Memory view ---------------- */

function MemoryGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 500, height: 400 })

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDims({ width: rect.width || 500, height: rect.height || 400 })
    }
  }, [])

  const { width, height } = dims
  const nodes = [
    { id: 'jorge', label: 'Jorge Alvarez', type: 'person', x: width * 0.35, y: height * 0.4 },
    { id: 'q3-plan', label: 'Q3 planning', type: 'topic', x: width * 0.6, y: height * 0.3 },
    { id: 'standup', label: 'Weekly standup', type: 'event', x: width * 0.55, y: height * 0.6 },
  ]
  const edges: [string, string][] = [['jorge', 'q3-plan'], ['jorge', 'standup']]
  const nodeColors: Record<string, string> = { person: 'var(--blue)', topic: 'var(--bronze)', event: 'var(--gold)' }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

  return (
    <div id="memory-graph-container" ref={containerRef}>
      <svg width={width} height={height}>
        {edges.map(([a, b], i) => (
          <line key={i} className="memory-edge" x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} />
        ))}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <circle r={7} fill={nodeColors[n.type]} />
            <text className="memory-node-label" textAnchor="middle" dy={-12}>{n.label}</text>
          </g>
        ))}
      </svg>
      <div className="memory-empty-note">Illustrative sample below. Empty by design until real entities exist.</div>
    </div>
  )
}

/* ---------------- Settings view ---------------- */

function SettingsView({ entwinName, setEntwinName }: { entwinName: string; setEntwinName: (v: string) => void }) {
  const [provider, setProvider] = useState<ProviderKey>('claude')
  const [selectedModel, setSelectedModel] = useState<Record<ProviderKey, string>>({
    claude: PROVIDER_MODELS.claude[0],
    gemini: PROVIDER_MODELS.gemini[0],
    openai: PROVIDER_MODELS.openai[0],
    neocloud: PROVIDER_MODELS.neocloud[0],
    onprem: PROVIDER_MODELS.onprem[0],
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const isSelfHosted = !!SELF_HOSTED[provider]

  const backends: { value: ProviderKey; name: string; desc?: string }[] = [
    { value: 'claude', name: 'Claude API' },
    { value: 'gemini', name: 'Gemini API' },
    { value: 'openai', name: 'Open-AI API' },
    { value: 'neocloud', name: 'Neocloud', desc: 'Self-hosted LLM, rented GPU compute.' },
    { value: 'onprem', name: 'On-prem LLM', desc: 'Self-hosted LLM, runs on your own hardware.' },
  ]

  return (
    <>
      <div className="view-header">Settings</div>
      <div id="settings-body">
        <div className="settings-section">
          <div className="settings-label">Entwin identity</div>
          <div className="settings-help">Give your digital twin a name. It&apos;s used across the app, like in &quot;Memory&quot;.</div>
          <label className="field-label" htmlFor="entwin-name-input">Name your Entwin</label>
          <input type="text" className="text-input" id="entwin-name-input" placeholder="Entwin" value={entwinName} onChange={(e) => setEntwinName(e.target.value)} />
        </div>

        <div className="settings-section">
          <div className="settings-label">LLM backend</div>
          <div className="settings-help">Choose which model answers queries against the vault. This can be changed later without touching the rest of the app.</div>

          {backends.map((b) => (
            <label className="backend-option" key={b.value}>
              <input type="radio" name="backend" value={b.value} checked={provider === b.value} onChange={() => { setProvider(b.value); setMenuOpen(false) }} />
              <span>
                <div className="backend-option-name">{b.name}</div>
                {b.desc && <div className="backend-option-desc">{b.desc}</div>}
              </span>
            </label>
          ))}

          <div className="model-select-box" ref={boxRef}>
            <label className="field-label" style={{ marginTop: 0 }}>Model</label>
            <button className="model-select-btn" onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}>
              <span>{selectedModel[provider]}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className={`model-select-menu${menuOpen ? ' open' : ''}`}>
              {PROVIDER_MODELS[provider].map((m) => (
                <button
                  className={`model-select-item${m === selectedModel[provider] ? ' selected' : ''}`}
                  key={m}
                  onClick={() => { setSelectedModel((prev) => ({ ...prev, [provider]: m })); setMenuOpen(false) }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>{m}</span>
                </button>
              ))}
            </div>
          </div>

          {!isSelfHosted && (
            <div id="api-key-field">
              <label className="field-label" htmlFor="api-key">API key</label>
              <input type="password" className="text-input" id="api-key" placeholder="sk-ant-..." />
            </div>
          )}
          {isSelfHosted && (
            <div id="endpoint-field">
              <label className="field-label" htmlFor="endpoint-input">{provider === 'neocloud' ? 'Endpoint URL' : 'Host address'}</label>
              <input type="text" className="text-input" id="endpoint-input" placeholder={provider === 'neocloud' ? 'https://your-neocloud-instance.example.com' : 'localhost:11434'} />
            </div>
          )}

          <div>
            <button className="save-btn" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800) }}>Save settings</button>
            <span className={`save-confirm${saved ? ' show' : ''}`}>Saved</span>
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------- App shell ---------------- */

const NAV: { key: ViewKey; label: string; icon: JSX.Element }[] = [
  { key: 'chat', label: 'Chat', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
  { key: 'connectors', label: 'Connectors', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0z" /><path d="M12 17v5" /></svg> },
  { key: 'dashboard', label: 'Dashboard', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
  { key: 'memory', label: 'Memory', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2.3" /><circle cx="18" cy="7" r="2.3" /><circle cx="10.5" cy="18" r="2.3" /><line x1="8.1" y1="6.6" x2="15.9" y2="6.9" /><line x1="7.4" y1="7.9" x2="9.6" y2="16" /><line x1="16.6" y1="8.9" x2="12.4" y2="16.4" /></svg> },
  { key: 'settings', label: 'Settings', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" /></svg> },
]

function AppShell() {
  const { data: session } = useSession()
  const user = session?.user
  const name = user?.name || 'Alex Whitmore'
  const email = user?.email || 'you@example.com'
  const initials = useMemo(
    () => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
    [name],
  )

  const [collapsed, setCollapsed] = useState(false)
  const [view, setView] = useState<ViewKey>('chat')
  const [chatResetKey, setChatResetKey] = useState(0)

  const [currentModel, setCurrentModel] = useState('Claude Sonnet 5')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelWrapRef = useRef<HTMLDivElement>(null)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userWrapRef = useRef<HTMLDivElement>(null)

  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS)
  const [entities, setEntities] = useState<Entity[]>(INITIAL_ENTITIES)
  const [entwinName, setEntwinName] = useState('')

  const connectedCount = connectors.filter((c) => c.connected).length

  // Kicks off a real Gmail scan: mark the card connected + scanning, pull the
  // deduped inbox/sent counts from the backend, then show them in small font.
  const runGmailScan = useMemo(
    () =>
      async (cardId: NonNullable<Connector['cardId']>) => {
        // Pull the connected account email so the card can label itself.
        let connectedEmail: string | null = null
        try {
          const st = await fetch(`/api/gmail/status?card=${cardId}`)
          if (st.ok) connectedEmail = (await st.json()).connectedEmail ?? null
        } catch {
          /* ignore */
        }

        setConnectors((prev) =>
          prev.map((c) =>
            c.cardId === cardId
              ? { ...c, connected: true, connectedEmail, scanning: true, scan: null }
              : c,
          ),
        )

        try {
          const res = await fetch('/api/gmail/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card: cardId }),
          })
          if (!res.ok) throw new Error('scan failed')
          const data = (await res.json()) as { inboxCount: number; sentCount: number }
          setConnectors((prev) =>
            prev.map((c) =>
              c.cardId === cardId
                ? { ...c, scanning: false, scan: { inboxCount: data.inboxCount, sentCount: data.sentCount } }
                : c,
            ),
          )
        } catch {
          setConnectors((prev) =>
            prev.map((c) => (c.cardId === cardId ? { ...c, scanning: false } : c)),
          )
        }
      },
    [],
  )

  // On return from Google consent (?gmail=connected&card=...), open the
  // Connectors view and start the scan for that card.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmail = params.get('gmail')
    const card = params.get('card')
    if (gmail === 'connected' && (card === 'gmail-personal' || card === 'gmail-professional')) {
      setView('connectors')
      runGmailScan(card)
    }
    if (gmail) {
      // Clean the URL so a refresh doesn't re-trigger the flow.
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [runGmailScan])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (modelWrapRef.current && !modelWrapRef.current.contains(e.target as Node)) setModelMenuOpen(false)
      if (userWrapRef.current && !userWrapRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const memoryTitle = `${entwinName.trim() || 'Entwin'}'s Memory`

  return (
    <div id="app-shell" style={{ display: 'flex' }}>
      <div id="sidebar" className={collapsed ? 'collapsed' : ''}>
        <div className="sidebar-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DATA_URI} width={20} height={20} alt="" style={{ flexShrink: 0, objectFit: 'contain' }} />
            <span className="wordmark">Entwin</span>
          </div>
          <button className="icon-btn" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>
          </button>
        </div>

        <div className="new-chat-wrap">
          <button className="new-chat-btn" onClick={() => { setView('chat'); setChatResetKey((k) => k + 1) }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="label">New chat</span>
          </button>
        </div>

        <nav className="nav-list">
          {NAV.map((n) => (
            <button className={`nav-item${view === n.key ? ' active' : ''}`} key={n.key} onClick={() => setView(n.key)}>
              {n.icon}
              <span className="label">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-bottom">
          <div className="user-menu-wrap" ref={userWrapRef}>
            <div id="user-menu" className={userMenuOpen ? 'open' : ''}>
              <div className="user-menu-email">{email}</div>
              <button className="user-menu-item" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
            </div>
            <button className="user-row" onClick={() => setUserMenuOpen((o) => !o)}>
              <span className="avatar">{initials}<span className="status-dot" aria-hidden="true" /></span>
              <span className="user-meta">
                <div className="user-name">{name}</div>
                <div className="user-sub">{email}</div>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div id="main">
        {/* CHAT */}
        <div className={`view${view === 'chat' ? ' active' : ''}`} id="view-chat">
          <div className="view-header chat-header">
            <div>Chat<div className="sub">Local placeholder — no model connected yet</div></div>
            <div className="model-picker-wrap" ref={modelWrapRef}>
              <button className="model-picker-btn" onClick={(e) => { e.stopPropagation(); setModelMenuOpen((o) => !o) }}>
                <span>{currentModel}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className={`model-picker-menu${modelMenuOpen ? ' open' : ''}`}>
                {MODELS.map((m) => (
                  <button
                    className={`model-option${m.name === currentModel ? ' selected' : ''}`}
                    key={m.name}
                    onClick={() => { setCurrentModel(m.name); setModelMenuOpen(false) }}
                  >
                    <span>
                      <div className="model-option-name">{m.name}</div>
                      <div className="model-option-desc">{m.desc}</div>
                    </span>
                    <svg className="model-option-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {view === 'chat' && <ChatView currentModel={currentModel} resetKey={chatResetKey} />}
        </div>

        {/* CONNECTORS */}
        <div className={`view${view === 'connectors' ? ' active' : ''}`} id="view-connectors">
          <div className="view-header">Connectors<div className="sub">Sources feeding the vault</div></div>
          <ConnectorsView connectors={connectors} setConnectors={setConnectors} runGmailScan={runGmailScan} />
        </div>

        {/* DASHBOARD */}
        <div className={`view${view === 'dashboard' ? ' active' : ''}`} id="view-dashboard">
          <DashboardView connectedCount={connectedCount} total={connectors.length} entities={entities} setEntities={setEntities} />
        </div>

        {/* MEMORY */}
        <div className={`view${view === 'memory' ? ' active' : ''}`} id="view-memory">
          <div className="view-header"><span>{memoryTitle}</span><div className="sub">How the pieces your Entwin knows connect to each other</div></div>
          {view === 'memory' && <MemoryGraph />}
        </div>

        {/* SETTINGS */}
        <div className={`view${view === 'settings' ? ' active' : ''}`} id="view-settings">
          <SettingsView entwinName={entwinName} setEntwinName={setEntwinName} />
        </div>
      </div>
    </div>
  )
}

/* ---------------- Root ---------------- */

export default function Home() {
  const { status } = useSession()

  if (status === 'loading') {
    return <div id="login-screen" style={{ display: 'flex' }}><div className="login-card"><div className="login-sub">Loading…</div></div></div>
  }

  if (status !== 'authenticated') {
    return <LoginScreen />
  }

  return <AppShell />
}

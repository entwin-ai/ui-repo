'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { LOGO_DATA_URI } from './logo'

type ViewKey = 'settings' | 'connectors' | 'dashboard' | 'memory' | 'chat'

interface Connector {
  id: string
  code: string
  name: string
  desc: string
  connected: boolean
  hasSync: boolean // Gmail gets the sync-now + polling controls
}

const INITIAL_CONNECTORS: Connector[] = [
  { id: 'gmail', code: 'GM', name: 'Gmail', desc: 'Email ingestion for the vault.', connected: true, hasSync: true },
  { id: 'gcal', code: 'GC', name: 'Google Calendar', desc: 'Meeting and scheduling context.', connected: false, hasSync: false },
  { id: 'whatsapp', code: 'WA', name: 'WhatsApp', desc: 'Personal messages, facet-decomposed. Links as a companion device to your number.', connected: false, hasSync: true },
  { id: 'slack', code: 'SL', name: 'Slack', desc: 'Work channel ingestion.', connected: false, hasSync: false },
  { id: 'anime', code: 'AM', name: 'Anime Maker', desc: 'Turn a story into an AI-generated movie. Upload a .txt story to begin.', connected: false, hasSync: false },
]

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
)

/* ---------------- Login screen (from entwin_frontend_v2.html) ---------------- */
function LoginScreen() {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const handleGoogle = () => {
    setBusy(true)
    // Real Google OAuth via NextAuth — redirects to accounts.google.com
    signIn('google', { callbackUrl: '/' })
  }

  const handleEmail = () => {
    setNote("Email sign-in isn't wired up yet — use Google to continue.")
    setTimeout(() => setNote(''), 3000)
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={28} height={28} alt="" style={{ flexShrink: 0, objectFit: 'contain' }} />
          <span className="wordmark">Entwin</span>
        </div>
        <div className="login-title">Sign in</div>
        <div className="login-sub">Your second brain, wherever you left it.</div>

        <button className="google-btn" onClick={handleGoogle} disabled={busy}>
          <GoogleG />
          <span>{busy ? 'Redirecting to Google…' : 'Continue with Google'}</span>
        </button>

        <div className="login-divider">or</div>
        <button className="login-email-link" onClick={handleEmail}>
          Continue with email
        </button>
        <div className="login-note">{note}</div>

        <div className="login-footer">
          By continuing, you agree to Entwin&apos;s Terms and acknowledge the Privacy Policy.
        </div>
      </div>
    </div>
  )
}

interface WaStatus {
  state: 'disconnected' | 'pairing' | 'connected'
  phone?: string
  pairingCode?: string
  pollEnabled: boolean
  pendingMessages: number
  totalMessages: number
  lastSync: number | null
  error?: string
}

const WA_IDLE: WaStatus = { state: 'disconnected', pollEnabled: true, pendingMessages: 0, totalMessages: 0, lastSync: null }

/* ---------------- Post-login app (layout from the screenshot) ---------------- */
function AppShell() {
  const { data: session } = useSession()
  const [view, setView] = useState<ViewKey>('connectors')
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS)
  const [pollEnabled, setPollEnabled] = useState(true)
  const [syncFeedback, setSyncFeedback] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi. This is a frontend check, not a live model — messages you send here are echoed locally so you can test the layout and interactions.' },
  ])
  const [chatInput, setChatInput] = useState('')
  const menuWrapRef = useRef<HTMLDivElement>(null)

  // ---- WhatsApp connector state ----
  const [wa, setWa] = useState<WaStatus>(WA_IDLE)
  const [waModalOpen, setWaModalOpen] = useState(false)
  const [waPhone, setWaPhone] = useState('')
  const [waBusy, setWaBusy] = useState(false)
  const [waError, setWaError] = useState('')
  const [waSyncFeedback, setWaSyncFeedback] = useState('')

  // ---- Anime Maker connector state ----
  const [animeModalOpen, setAnimeModalOpen] = useState(false)
  const [animeFile, setAnimeFile] = useState<File | null>(null)
  const [animeBusy, setAnimeBusy] = useState(false)
  const [animeError, setAnimeError] = useState('')
  const [animeDone, setAnimeDone] = useState('')
  const animeFileInputRef = useRef<HTMLInputElement>(null)

  const onAnimeBrowse = () => {
    setAnimeError('')
    animeFileInputRef.current?.click()
  }

  const onAnimeFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && !f.name.toLowerCase().endsWith('.txt')) {
      setAnimeError('Please choose a .txt file.')
      setAnimeFile(null)
      return
    }
    setAnimeError('')
    setAnimeFile(f)
  }

  const onAnimeUpload = async () => {
    if (!animeFile) {
      setAnimeError('Choose a .txt file first.')
      return
    }
    setAnimeBusy(true)
    setAnimeError('')
    setAnimeDone('')
    try {
      const body = new FormData()
      body.append('story', animeFile)
      const res = await fetch('/api/anime/upload', { method: 'POST', body })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      setAnimeDone('✓ Story uploaded. Your movie will be emailed when ready.')
      setConnectors((prev) => prev.map((c) => (c.id === 'anime' ? { ...c, connected: true } : c)))
      setTimeout(() => setAnimeModalOpen(false), 1600)
    } catch (err: any) {
      setAnimeError(err?.message || 'Upload failed. Try again.')
    } finally {
      setAnimeBusy(false)
    }
  }

  const refreshWa = async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) setWa(await res.json())
    } catch {
      /* server not reachable — leave last known state */
    }
  }

  // Poll status: every 3s while pairing, every 30s while connected
  useEffect(() => {
    refreshWa()
    const fast = wa.state === 'pairing' || waModalOpen
    const t = setInterval(refreshWa, fast ? 3000 : 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa.state, waModalOpen])

  // Mirror server state into the connector card + auto-close modal on success
  useEffect(() => {
    setConnectors((prev) =>
      prev.map((c) => (c.id === 'whatsapp' ? { ...c, connected: wa.state === 'connected' } : c))
    )
    if (wa.state === 'connected' && waModalOpen) {
      setTimeout(() => setWaModalOpen(false), 1200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa.state])

  const waConnect = async () => {
    setWaBusy(true)
    setWaError('')
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')
      setWa((w) => ({ ...w, state: data.state, pairingCode: data.pairingCode, phone: waPhone }))
    } catch (e) {
      setWaError((e as Error).message)
    } finally {
      setWaBusy(false)
    }
  }

  const waDisconnect = async () => {
    setWaBusy(true)
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      if (res.ok) setWa(await res.json())
    } finally {
      setWaBusy(false)
    }
  }

  const waSyncNow = async () => {
    setWaSyncFeedback('Syncing…')
    try {
      const res = await fetch('/api/whatsapp/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setWa(data)
        setWaSyncFeedback(`Synced ${data.written} new message${data.written === 1 ? '' : 's'}`)
      } else {
        setWaSyncFeedback(data.error || 'Sync failed')
      }
    } catch {
      setWaSyncFeedback('Sync failed')
    }
    setTimeout(() => setWaSyncFeedback(''), 3000)
  }

  const waTogglePoll = async (enabled: boolean) => {
    setWa((w) => ({ ...w, pollEnabled: enabled }))
    try {
      const res = await fetch('/api/whatsapp/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) setWa(await res.json())
    } catch {}
  }

  const fmtLastSync = (ts: number | null) => {
    if (!ts) return 'Never synced'
    const mins = Math.round((Date.now() - ts) / 60000)
    if (mins < 1) return 'Synced just now'
    if (mins === 1) return 'Synced 1 min ago'
    if (mins < 60) return `Synced ${mins} min ago`
    return `Synced at ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const user = session?.user
  const name = user?.name || user?.email || 'Signed in'
  const email = user?.email || ''
  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const toggleConnector = (id: string) => {
    if (id === 'anime') {
      setAnimeError('')
      setAnimeDone('')
      setAnimeFile(null)
      setAnimeModalOpen(true)
      return
    }
    if (id === 'whatsapp') {
      if (wa.state === 'connected') {
        waDisconnect()
      } else {
        setWaError('')
        setWaModalOpen(true)
      }
      return
    }
    setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, connected: !c.connected } : c)))
  }

  const syncNow = () => {
    setSyncFeedback('Syncing…')
    setTimeout(() => {
      setSyncFeedback('Synced just now')
      setTimeout(() => setSyncFeedback(''), 2500)
    }, 900)
  }

  const sendMessage = () => {
    const text = chatInput.trim()
    if (!text) return
    setMessages((m) => [...m, { role: 'user', text }])
    setChatInput('')
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'This is a placeholder reply. Connect a backend to get real answers from the vault.' },
      ])
    }, 350)
  }

  const crumbs: { key: ViewKey; label: string }[] = [
    { key: 'settings', label: 'Settings' },
    { key: 'connectors', label: 'Connectors' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'memory', label: 'Memory' },
    { key: 'chat', label: 'Chat' },
  ]

  return (
    <div id="app-page">
      {/* ---- Top header ---- */}
      <div id="tour-header">
        <div>
          <div className="tour-title">Entwin — frontend tour</div>
          <div className="tour-sub">
            A personal-knowledge assistant: connect your data sources, it builds a private vault + knowledge graph, you
            chat against it.
          </div>
        </div>
        <div className="tour-crumbs">
          {crumbs.map((c, i) => (
            <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="tour-crumb-arrow">→</span>}
              <button
                className={'tour-crumb' + (view === c.key ? ' active' : '')}
                onClick={() => setView(c.key)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div id="app-shell">
        {/* ---- Sidebar ---- */}
        <div id="sidebar" className={collapsed ? 'collapsed' : ''}>
          <div className="sidebar-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_DATA_URI} width={20} height={20} alt="" style={{ flexShrink: 0, objectFit: 'contain' }} />
              <span className="wordmark">Entwin</span>
            </div>
            <button className="icon-btn" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </button>
          </div>

          <div className="new-chat-wrap">
            <button className="new-chat-btn" onClick={() => setView('chat')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="label">New chat</span>
            </button>
          </div>

          <nav className="nav-list">
            <button className={'nav-item' + (view === 'dashboard' ? ' active' : '')} onClick={() => setView('dashboard')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <span className="label">Dashboard</span>
            </button>
            <button className={'nav-item' + (view === 'chat' ? ' active' : '')} onClick={() => setView('chat')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="label">Chat</span>
            </button>
            <button className={'nav-item' + (view === 'connectors' ? ' active' : '')} onClick={() => setView('connectors')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0z" />
                <path d="M12 17v5" />
              </svg>
              <span className="label">Connectors</span>
            </button>
            <button className={'nav-item' + (view === 'memory' ? ' active' : '')} onClick={() => setView('memory')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v18" />
                <path d="M12 7c0-2 2-4 5-4" />
                <path d="M12 7c0-2-2-4-5-4" />
                <path d="M12 14c0-2 3-3 6-2" />
                <path d="M12 14c0-2-3-3-6-2" />
              </svg>
              <span className="label">Entwin&apos;s Memory</span>
            </button>
            <button className={'nav-item' + (view === 'settings' ? ' active' : '')} onClick={() => setView('settings')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
              </svg>
              <span className="label">Settings</span>
            </button>
          </nav>

          <div className="sidebar-spacer" />

          <div className="sidebar-bottom">
            <div className="user-menu-wrap" ref={menuWrapRef}>
              <div id="user-menu" className={menuOpen ? 'open' : ''}>
                <div className="user-menu-email">{email}</div>
                <button className="user-menu-item" onClick={() => signOut({ callbackUrl: '/' })}>
                  Sign out
                </button>
              </div>
              <button
                className="user-row"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen((o) => !o)
                }}
              >
                <span className="avatar">
                  {user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    initials
                  )}
                  <span className="status-dot" aria-hidden="true" />
                </span>
                <span className="user-meta">
                  <span className="user-name" style={{ display: 'block' }}>{name}</span>
                  <span className="user-sub" style={{ display: 'block' }}>{email}</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ---- Main ---- */}
        <div id="main">
          {/* CONNECTORS */}
          <div className={'view' + (view === 'connectors' ? ' active' : '')}>
            <div className="view-header">
              Connectors
              <div className="sub">Sources feeding the vault</div>
            </div>
            <div id="connectors-grid">
              {connectors.map((c) => (
                <div className="connector-card" key={c.id}>
                  <div className="connector-top">
                    <div className="connector-icon">{c.code}</div>
                    <div className="connector-name">{c.name}</div>
                  </div>
                  <div className="connector-desc">{c.desc}</div>
                  <div className="connector-bottom">
                    <span className={'connector-status ' + (c.connected ? 'connected' : 'off')}>
                      {c.connected ? 'Connected' : 'Not connected'}
                    </span>
                    {c.connected ? (
                      <button className="disconnect-btn" onClick={() => toggleConnector(c.id)}>
                        Disconnect
                      </button>
                    ) : (
                      <button className="connect-btn" onClick={() => toggleConnector(c.id)}>
                        Connect
                      </button>
                    )}
                  </div>
                  {c.id === 'gmail' && c.connected && (
                    <div className="connector-sync">
                      <button className="sync-now-btn" onClick={syncNow} disabled={syncFeedback === 'Syncing…'}>
                        Sync now
                      </button>
                      <label className="poll-row">
                        <input
                          type="checkbox"
                          checked={pollEnabled}
                          onChange={(e) => setPollEnabled(e.target.checked)}
                        />
                        Poll every <span className="poll-interval">15 min</span>
                      </label>
                      <div className="sync-feedback">{syncFeedback}</div>
                    </div>
                  )}
                  {c.id === 'whatsapp' && wa.state === 'connected' && (
                    <div className="connector-sync">
                      <div className="wa-meta">
                        <span className="wa-phone">+{wa.phone}</span>
                        <span className="wa-counts">
                          {wa.totalMessages.toLocaleString()} messages · {wa.pendingMessages} pending
                        </span>
                      </div>
                      <button className="sync-now-btn" onClick={waSyncNow} disabled={waSyncFeedback === 'Syncing…'}>
                        Sync now
                      </button>
                      <label className="poll-row">
                        <input
                          type="checkbox"
                          checked={wa.pollEnabled}
                          onChange={(e) => waTogglePoll(e.target.checked)}
                        />
                        Poll every <span className="poll-interval">15 min</span>
                      </label>
                      <div className="sync-feedback">{waSyncFeedback || fmtLastSync(wa.lastSync)}</div>
                    </div>
                  )}
                  {c.id === 'whatsapp' && wa.state === 'pairing' && !waModalOpen && (
                    <div className="connector-sync">
                      <div className="sync-feedback">
                        Pairing in progress —{' '}
                        <button className="wa-link-btn" onClick={() => setWaModalOpen(true)}>
                          show code
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CHAT */}
          <div className={'view' + (view === 'chat' ? ' active' : '')}>
            <div className="view-header">
              Chat
              <div className="sub">Local placeholder — no model connected yet</div>
            </div>
            <div id="chat-messages">
              {messages.map((m, i) => (
                <div className={'msg ' + m.role} key={i}>
                  <div className="role-label">{m.role === 'user' ? 'You' : 'Entwin'}</div>
                  <div className="bubble">{m.text}</div>
                </div>
              ))}
            </div>
            <div className="chat-input-wrap">
              <div className="chat-input-box">
                <textarea
                  id="chat-input"
                  rows={1}
                  placeholder="Message Entwin..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                />
                <button className="send-btn" aria-label="Send message" onClick={sendMessage}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className={'view' + (view === 'dashboard' ? ' active' : '')}>
            <div className="view-header">Dashboard</div>
            <div className="placeholder-body">
              Vault overview will appear here — ingestion stats, knowledge-graph size, and recent activity.
            </div>
          </div>

          {/* MEMORY */}
          <div className={'view' + (view === 'memory' ? ' active' : '')}>
            <div className="view-header">Entwin&apos;s Memory</div>
            <div className="placeholder-body">
              The knowledge graph built from your connected sources will be browsable here.
            </div>
          </div>

          {/* SETTINGS */}
          <div className={'view' + (view === 'settings' ? ' active' : '')}>
            <div className="view-header">Settings</div>
            <div className="placeholder-body">Application settings will appear here.</div>
          </div>
        </div>
      </div>

      {/* ---- WhatsApp pairing modal ---- */}
      {waModalOpen && (
        <div className="wa-modal-backdrop" onClick={() => !waBusy && setWaModalOpen(false)}>
          <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-title">Connect WhatsApp</div>

            {wa.state === 'connected' ? (
              <div className="wa-modal-body">
                <div className="wa-success">✓ WhatsApp linked. History sync has started.</div>
              </div>
            ) : wa.pairingCode ? (
              <div className="wa-modal-body">
                <div className="wa-modal-sub">
                  On your phone, open <b>WhatsApp → Settings → Linked devices → Link a device → Link with phone
                  number instead</b>, then enter this code:
                </div>
                <div className="wa-pairing-code">{wa.pairingCode}</div>
                <div className="wa-modal-note">
                  Waiting for you to confirm on your phone… this screen updates automatically. After linking,
                  Entwin receives your chat history and new messages, and syncs them into your vault every 15
                  minutes.
                </div>
              </div>
            ) : (
              <div className="wa-modal-body">
                <div className="wa-modal-sub">
                  Enter your WhatsApp mobile number (with country code). Entwin will link to your account as a
                  companion device — like WhatsApp Web — so it can read your chats. You approve the link on your
                  phone and can revoke it any time from Linked devices.
                </div>
                <input
                  className="wa-phone-input"
                  type="tel"
                  placeholder="+1 312 555 1234"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !waBusy && waConnect()}
                  autoFocus
                />
                {waError && <div className="wa-error">{waError}</div>}
                <button className="connect-btn wa-modal-connect" onClick={waConnect} disabled={waBusy || !waPhone.trim()}>
                  {waBusy ? 'Requesting pairing code…' : 'Get pairing code'}
                </button>
              </div>
            )}

            <button className="wa-modal-close" onClick={() => setWaModalOpen(false)} disabled={waBusy}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ---- Anime Maker upload modal ---- */}
      {animeModalOpen && (
        <div className="wa-modal-backdrop" onClick={() => !animeBusy && setAnimeModalOpen(false)}>
          <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-title">Anime Maker</div>

            {animeDone ? (
              <div className="wa-modal-body">
                <div className="wa-success">{animeDone}</div>
              </div>
            ) : (
              <div className="wa-modal-body">
                <div className="wa-modal-sub">
                  Upload a story as a plain-text <b>.txt</b> file. Entwin turns it into an AI-generated movie and
                  emails you a link when it&apos;s ready.
                </div>

                {/* Hidden native picker — opened by the Browse button */}
                <input
                  ref={animeFileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  style={{ display: 'none' }}
                  onChange={onAnimeFilePicked}
                />

                <div className="anime-file-row">
                  <button className="anime-browse-btn" onClick={onAnimeBrowse} disabled={animeBusy}>
                    Browse…
                  </button>
                  <span className="anime-file-name">
                    {animeFile ? animeFile.name : 'No file selected'}
                  </span>
                </div>

                {animeError && <div className="wa-error">{animeError}</div>}

                <button
                  className="connect-btn wa-modal-connect"
                  onClick={onAnimeUpload}
                  disabled={animeBusy || !animeFile}
                >
                  {animeBusy ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            )}

            <button className="wa-modal-close" onClick={() => setAnimeModalOpen(false)} disabled={animeBusy}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Entry ---------------- */
export default function Home() {
  const { status } = useSession()

  if (status === 'loading') {
    return <div id="loading-screen">Loading…</div>
  }
  if (status !== 'authenticated') {
    return <LoginScreen />
  }
  return <AppShell />
}

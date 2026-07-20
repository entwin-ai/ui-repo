# Entwin — Frontend v2 (Google sign-in + Connectors)

A stripped-down Next.js app with exactly one flow:

1. **Login screen** (from `entwin_frontend_v2.html`) with a **Continue with Google** button.
2. Clicking it redirects to the **real Google sign-in screen** (OAuth via NextAuth, basic scopes: `openid email profile`).
3. After successful authentication, the app shows the **Connectors page** — sidebar (New chat, Dashboard, Chat, Connectors, Entwin's Memory), header, and the four connector cards (Gmail connected with *Sync now* + *Poll every 15 min*; Google Calendar, WhatsApp, Slack not connected). The design-notes panel and screenshot annotations are not included.

The signed-in user's Google name, email, and avatar appear at the bottom of the sidebar, with a **Sign out** menu.

## Setup

### 1. Google OAuth credentials

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** → Application type: **Web application**.
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID and Client Secret.

### 2. Environment

```bash
cp .env.local.example .env.local
```

Fill in:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)
```

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll see the sign-in screen. Click **Continue with Google**, complete Google's consent screen, and you'll land on the Connectors page.

## Project structure

```
app/
  api/auth/[...nextauth]/route.ts   # NextAuth — Google provider only, basic scopes
  layout.tsx                        # Root layout
  providers.tsx                     # SessionProvider
  globals.css                       # Styles ported from entwin_frontend_v2.html
  logo.ts                           # Embedded Entwin logo
  page.tsx                          # Login screen + post-login app shell
```

## What was removed from the original repo

- Marketing landing page components (Hero, Features, Pricing, CTA, Footer, Navigation, Privacy, ValueProposition, WelcomePopup, AuthModal) and their CSS modules
- Microsoft / Azure AD sign-in (provider + `/api/auth/microsoft` route)
- Custom JWT auth routes (`/api/auth/google`, `/api/auth/session`, `/api/auth/logout`) — NextAuth handles all of this
- `lib/auth-context.tsx` custom auth context
- Unused dependencies: `axios`, `bcryptjs`, `jsonwebtoken`, `@types/jsonwebtoken`
- Stray `index.html`, old auth docs

## WhatsApp connector (v2.1)

The WhatsApp card is now live. Because WhatsApp chats are end-to-end encrypted, a phone
number alone can't unlock messages — Entwin instead links to the user's account as a
**companion device** (same mechanism as WhatsApp Web), using
[Baileys](https://github.com/WhiskeySockets/Baileys):

1. User clicks **Connect** on the WhatsApp card and enters their mobile number
   (international format).
2. Entwin requests an **8-character pairing code** and shows it in a modal.
3. User enters the code on their phone: *WhatsApp → Settings → Linked devices →
   Link a device → Link with phone number instead*.
4. Once linked, the phone pushes chat history (`syncFullHistory`) and every new
   incoming/outgoing message in real time.

Messages are buffered server-side and flushed into a per-user vault file every
**15 minutes** (`.entwin-data/vault/<user>-whatsapp.jsonl`), toggleable from the card;
**Sync now** flushes immediately. Device credentials live in `.entwin-data/wa-auth/<user>/`
— **Disconnect** logs the device out, revokes the link, and deletes the credentials.

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/whatsapp/connect` | POST `{phone}` | Start session, return pairing code |
| `/api/whatsapp/status` | GET | State, phone, counts, last sync |
| `/api/whatsapp/sync` | POST | Flush buffered messages to vault now |
| `/api/whatsapp/poll` | POST `{enabled}` | Toggle the 15-minute auto-sync |
| `/api/whatsapp/disconnect` | POST | Logout, revoke link, wipe credentials |
| `/api/whatsapp/messages` | GET `?limit=20` | Recent vault messages (preview) |

All routes require a signed-in NextAuth session; state is keyed per user email.

### Caveats

- Baileys is an unofficial WhatsApp Web client. It works well for read-only ingestion,
  but review WhatsApp's ToS before shipping — accounts doing bulk/automated *sending*
  get banned. This connector is passive (read-only, `markOnlineOnConnect: false`).
- Sessions are in-process. In dev they survive hot reloads via a `globalThis` handle,
  but a server restart requires re-opening the socket (credentials persist, so it
  reconnects without re-pairing — just hit Connect again with the same number).
- For production, move the service out of Next.js API routes into a long-running
  worker so the socket and 15-minute timer aren't tied to the web process.

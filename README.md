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

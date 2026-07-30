# Entwin RAG — additions to the v3.5 frontend

This layers a **standard RAG over Gmail** onto your existing Next.js app without
disturbing what already works. Auth, the Gmail OAuth/scan flow, WhatsApp, and the
UI are untouched except for one additive hook (fire ingestion after a scan) and
one additive cleanup (remove `sync_state` on disconnect).

## Architecture

```
Next.js app (Vercel)   existing OAuth + scan  +  NEW /api/gmail/ingest (dispatch)  +  NEW /api/ask (query)
GitHub Actions worker  1-yr backfill (on connect) + delta sync (cron) — reads Gmail tokens from Upstash Redis
Supabase (pgvector)    Memory Notes, daily rollups, vector chunks, sync cursors
LLMs                   Anthropic (write note + extract entities), OpenAI (embeddings)
```

Implements the Entwin **three-tier email flow** (ignore / storage / memory-worthy)
and the **Memory Note v4** anatomy. **Standard RAG only** — the entity-bubble /
wiki layer is not built yet, but `related_entities` is captured so it can be
added later with no re-parse.

## LLM: bring-your-own-key, provider-agnostic

Each user sets their own LLM provider + API key in the **Settings** page. The key
is stored **encrypted (AES-256-GCM) in Upstash Redis**, keyed by user email, and
is used for ALL LLM work for that user: email parsing (write note + extract
entities), the tier-2 updates summary, embeddings, and the `/api/ask` answer.

Supported providers (each does chat + embeddings): **Claude** (chat via
Anthropic, embeddings via Voyage), **OpenAI**, **Gemini**. The provider layer
(`worker/src/lib/provider.js` and `lib/rag/provider.ts`) is a single interface
with per-vendor adapters, so adding a provider is one adapter, not a pipeline
change. Embeddings from any provider are normalized to 1536 dims to fit the
fixed `vector(1536)` column.

Embedding model names are **config-driven** (not hardcoded): the worker and app
read `CLAUDE_EMBED_MODEL`, `OPENAI_EMBED_MODEL`, `GEMINI_EMBED_MODEL` from the
environment, falling back to current defaults (`voyage-3`,
`text-embedding-3-small`, `gemini-embedding-001`). If a provider renames or
retires an embedding model, change the env var — no code change. Set the same
values in Vercel and the GitHub `ingestion` environment.

The key is **write-only** from the browser's perspective: after saving, no
endpoint ever returns it. The app and worker share one secret,
`ENTWIN_KEY_SECRET`, used only to encrypt/decrypt these per-user keys — neither
holds any provider API key of its own.

## Isolation model

Users are identified by **Google email via NextAuth** (not Supabase Auth), so
isolation is enforced in the **service layer**: every Supabase query is scoped by
the session email, always taken from `getServerSession`, never from request
input. Defense in depth: RLS is enabled and FORCED on every table with no
anon/authenticated policies. Per-user LLM keys are isolated the same way — the
Redis key is derived from the user's email.

## What was added

New files:
- `supabase/migrations/0001_schema.sql` — tables keyed by `(user_email, card_id)`
- `supabase/migrations/0002_rls.sql` — RLS lockdown
- `supabase/migrations/0003_match_rpc.sql` — user-scoped vector retrieval RPC
- `worker/` — the GitHub Actions ingestion worker (reads tokens from Redis)
- `.github/workflows/backfill.yml` + `delta.yml`
- `lib/rag/supabase.ts` — server-only service-role client
- `lib/rag/query.ts` — embed → retrieve (scoped) → answer with Claude
- `app/api/gmail/ingest/route.ts` — registers `sync_state`, dispatches backfill
- `app/api/ask/route.ts` — the RAG query endpoint

Touched files (additive only):
- `app/page.tsx` — after a successful scan, POST `/api/gmail/ingest` (fire-and-forget)
- `app/api/gmail/disconnect/route.ts` — also delete the `sync_state` row
- `package.json` — add `@supabase/supabase-js`
- `.env.local.example` — add Supabase / LLM / GitHub-dispatch vars

## Setup

### 1. Supabase
Create a project; run `0001` → `0002` → `0003` in the SQL editor. Enable the
`vector` extension if not auto-enabled. Copy the project URL and service-role key.

### 2. Vercel env (add to existing)
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
ENTWIN_KEY_SECRET              # openssl rand -base64 32 — SAME value in the worker
GH_REPO, GH_DISPATCH_TOKEN     # fine-grained PAT, Actions: read/write
```
(You already have GOOGLE_*, NEXTAUTH_*, UPSTASH_REDIS_REST_*.)

### 3. GitHub Actions
Push the repo (private). Create an Environment named `ingestion` and add secrets:
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
ENTWIN_KEY_SECRET             # MUST match the app's value
```
The worker reads Gmail refresh tokens from the SAME Upstash Redis your app
already uses (identical key scheme), so no token migration is needed.

### 4. Flow
User connects a Gmail card (existing) → scan runs (existing) → app POSTs
`/api/gmail/ingest` → `sync_state` row created + backfill workflow dispatched →
worker backfills 1 year, then the delta cron keeps it fresh → user asks questions
via `/api/ask`.

## Caveats (unchanged from the design discussion)

- **GitHub cron is best-effort** — the 15-min delta can be delayed or skipped and
  auto-disables after 60 days of repo inactivity. For reliable freshness, drive
  `workflow_dispatch` from Supabase `pg_cron` or Trigger.dev/QStash; the workflow
  body stays identical.
- **Backfill on a large mailbox** may exceed the 6-hour job cap — it checkpoints
  `backfill_cursor` and resumes on the next run.
- **Reading many users' Gmail** triggers Google's restricted-scope verification
  and likely an annual third-party security assessment. Plan for it before real
  users.
- **Embedding egress**: email text goes to the user's chosen provider for
  embeddings. If content must stay in-house, add a local-embedding adapter in the
  provider layer.

## Wiki RAG (later)

`related_entities` is stored now. The Entity-file layer, Memory Note References,
bubble sizing, and the alias Resolver are the wiki-RAG scope and read from
`memory_note.related_entities` when you build them — no re-ingestion.


## Retrieval granularity: full-body chunks

The RAG layer embeds the **full cleaned email body**, not just the LLM summary.
Long bodies are split into overlapping ~2800-char chunks (`worker/src/lib/chunk.js`);
each chunk becomes one `note_chunk` row (incrementing `chunk_index`). The first
chunk is prefixed with a context header (sender/date/subject + summary) so a
match on it still has framing. This makes specific facts inside an email
retrievable, not only what the summary happened to capture.

At query time (`/api/ask`) `match_count` is 12 (a single email can span several
chunks), all retrieved chunks feed the LLM as context, and the **sources shown
to the user are deduped by email** so one message = one citation link.

Note: this increases embedding calls per email (one per chunk). If you re-parse
existing mail to pick up full-body chunks, clear old rows first (delete the
user's `email_message` rows with the reprocess query) and re-run the backfill.

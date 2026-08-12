# Date-range scoping + answer prioritisation & bold rendering

Three related fixes to the RAG answer path (`/api/ask`), addressing:

1. Queries with an explicit date bound ("outstanding tasks **since 1st
   August**") returned notes from before that date.
2. Answers didn't lead with the most important point.
3. Answers had no bold emphasis on key facts — even when the model emitted
   Markdown, the frontend stripped it.

## What changed

### 1. Date-range filtering (retrieval-level, not prompt-level)

- **`lib/rag/date-range.ts`** (new) — dependency-free parser that extracts an
  explicit `{from, to}` window from the question. Handles `since`, `after`,
  `from`, `before`, `until`, `between … and …`, `in <month>`, `last/past N
  days|weeks|months`, `this/last week|month`, `today`, `yesterday`, and ISO /
  `1st August` / `Aug 1 2025` date forms. Returns nulls when there's no bound,
  so unbounded queries behave exactly as before.
- **`supabase/migrations/0026_match_hybrid_date_range.sql`** (new) — adds two
  nullable params `p_date_from` / `p_date_to` to `match_note_chunks_hybrid` and
  filters `memory_note.note_date` in SQL. Out-of-window notes are excluded
  **before** ranking, so they can never crowd out in-window matches in the
  top-N, and the model never sees them. **Run this migration** against your
  Supabase project.
- **`lib/rag/query.ts`** — parses the range, passes it to the RPC, widens the
  candidate set to 40 when a window is active (a window may hold more than the
  default 15 relevant items), and echoes the applied window back in the answer.

Why not just prompt the model to filter? It only sees the top-K retrieved rows
and does fuzzy string date comparison — near-boundary items get dropped
non-deterministically, and in-window items ranked 16th+ never reach it. The
filter belongs in SQL, where it's exact.

### 2. Lead with the most important point + bold key facts

- **`lib/rag/query.ts`** — the system prompt now instructs the model to lead
  with the single most important (most urgent / time-sensitive) item, order the
  rest by importance, bold the critical facts (deadlines, dates, amounts,
  names, who's waiting on whom), and format item sets as bullet lists. When a
  date window is present it opens with a bold header naming the window, so the
  user can confirm the scope was understood.

### 3. Markdown actually renders now

- **`app/page.tsx`** — the previous `stripMarkup()` deleted bold/headers/bullets
  before rendering. Replaced with a small dependency-free `MarkdownAnswer`
  renderer (`**bold**`, `*italic*`, `` `code` ``, bullet/numbered lists,
  `#/##/###` headers) that also threads `[n]` citations through as links. Wired
  into both the main chat bubble (assistant turns) and the wiki panel.
- **`app/globals.css`** — styles for the header / inline-code classes and a
  bubble margin reset.

## Scope / safety

- User isolation (`p_user_email`) is unchanged and still hard-scoped.
- Undated questions and the recency ("latest/most recent") path are unaffected.
- User and error messages still render as plain text; only assistant answers
  are rendered as Markdown.

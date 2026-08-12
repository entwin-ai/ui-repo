// ============================================================================
// Natural-language date-range extraction for RAG queries.
//
// Vector + keyword retrieval has no notion of an explicit date bound. When a
// user asks for "outstanding tasks since 1st August" they mean: *exclude*
// anything dated before that. Relying on the LLM to filter in-prompt is
// unreliable — it only sees the top-K retrieved rows and does fuzzy string
// date comparison. So we parse an explicit {from, to} window here and push it
// into the SQL RPC, where the filter is exact and cheap.
//
// This is deliberately dependency-free and covers the common phrasings:
//   "since 1st August", "since Aug 1 2025", "after 2025-08-01",
//   "before September", "until 15 Sept", "in July", "last 2 weeks",
//   "past 3 days", "last month", "this week", "between 1 Aug and 15 Aug",
//   "yesterday", "today".
// Anything it can't parse returns nulls, and retrieval behaves exactly as
// before (undated).
// ============================================================================

export interface DateRange {
  from: string | null // inclusive YYYY-MM-DD, or null for open-ended
  to: string | null // inclusive YYYY-MM-DD, or null for open-ended
  label: string | null // human-readable window, echoed back to the user
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Resolve a bare month (no year) to a year. Direction disambiguates a
// future-looking month:
//   'past'   — the most recent occurrence not in the future ("in July" in Aug
//              2025 → July 2025). Used for since/after/in windows.
//   'future' — the nearest upcoming occurrence, staying in the current year
//              when the month is still ahead ("before September" in Aug 2025 →
//              Sept 2025, not 2024). Used for before/until bounds.
function resolveYear(month: number, now: Date, direction: 'past' | 'future' = 'past'): number {
  const y = now.getUTCFullYear()
  if (direction === 'future') return y // nearest upcoming/current-year occurrence
  return month > now.getUTCMonth() ? y - 1 : y
}

// Parse a single "1st August", "Aug 1 2025", "2025-08-01", "1/8/2025" style
// date fragment into a Date (UTC midnight). Returns null if it can't.
// `direction` only affects bare-month resolution when no year is given.
function parseDateFragment(raw: string, now: Date, direction: 'past' | 'future' = 'past'): Date | null {
  const s = raw.trim().toLowerCase()

  // ISO: 2025-08-01
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))

  // "1st August 2025" / "1 aug" / "august 1, 2025" / "aug 1"
  // day-first
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/)
  if (m && MONTHS[m[2]] !== undefined) {
    const month = MONTHS[m[2]]
    const year = m[3] ? +m[3] : resolveYear(month, now, direction)
    return new Date(Date.UTC(year, month, +m[1]))
  }
  // month-first
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/)
  if (m && MONTHS[m[1]] !== undefined) {
    const month = MONTHS[m[1]]
    const year = m[3] ? +m[3] : resolveYear(month, now, direction)
    return new Date(Date.UTC(year, month, +m[2]))
  }

  // bare month name → first of that month
  if (MONTHS[s] !== undefined) {
    const month = MONTHS[s]
    return new Date(Date.UTC(resolveYear(month, now, direction), month, 1))
  }

  return null
}

function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0))
}

/**
 * Extract an explicit date window from a free-text question. Returns nulls when
 * no temporal bound is present, in which case retrieval is unbounded as before.
 * `now` is injectable for testing; defaults to the current date.
 */
export function extractDateRange(question: string, now: Date = new Date()): DateRange {
  const q = question.toLowerCase()
  const none: DateRange = { from: null, to: null, label: null }

  // --- between X and Y ------------------------------------------------------
  let m = q.match(
    /\bbetween\s+(.+?)\s+(?:and|to|-)\s+(.+?)(?:[.?!,]|$)/,
  )
  if (m) {
    const a = parseDateFragment(m[1], now)
    const b = parseDateFragment(m[2], now)
    if (a && b) {
      const lo = a <= b ? a : b
      const hi = a <= b ? b : a
      return { from: iso(lo), to: iso(hi), label: `${fmt(lo)} – ${fmt(hi)}` }
    }
  }

  // --- relative windows: last/past N days|weeks|months ----------------------
  m = q.match(/\b(?:last|past|previous)\s+(\d+)\s+(day|week|month)s?\b/)
  if (m) {
    const n = +m[1]
    const unit = m[2]
    const from = new Date(now)
    if (unit === 'day') from.setUTCDate(from.getUTCDate() - n)
    else if (unit === 'week') from.setUTCDate(from.getUTCDate() - n * 7)
    else from.setUTCMonth(from.getUTCMonth() - n)
    return { from: iso(from), to: iso(now), label: `the last ${n} ${unit}${n === 1 ? '' : 's'}` }
  }

  // --- last/this week|month -------------------------------------------------
  if (/\bthis week\b/.test(q)) {
    const from = new Date(now)
    from.setUTCDate(from.getUTCDate() - from.getUTCDay()) // back to Sunday
    return { from: iso(from), to: iso(now), label: 'this week' }
  }
  if (/\blast week\b/.test(q)) {
    const start = new Date(now)
    start.setUTCDate(start.getUTCDate() - start.getUTCDay() - 7)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    return { from: iso(start), to: iso(end), label: 'last week' }
  }
  if (/\bthis month\b/.test(q)) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { from: iso(from), to: iso(now), label: 'this month' }
  }
  if (/\blast month\b/.test(q)) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const to = endOfMonth(now.getUTCFullYear(), now.getUTCMonth() - 1)
    return { from: iso(from), to: iso(to), label: 'last month' }
  }

  // --- today / yesterday ----------------------------------------------------
  if (/\btoday\b/.test(q)) {
    return { from: iso(now), to: iso(now), label: 'today' }
  }
  if (/\byesterday\b/.test(q)) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - 1)
    return { from: iso(d), to: iso(d), label: 'yesterday' }
  }

  // --- since / after / from X ----------------------------------------------
  m = q.match(/\b(?:since|after|from|starting)\s+(.+?)(?:[.?!,]|$)/)
  if (m) {
    const d = parseDateFragment(m[1], now)
    if (d) return { from: iso(d), to: null, label: `since ${fmt(d)}` }
  }

  // --- before / until / up to X --------------------------------------------
  m = q.match(/\b(?:before|until|till|up to|by)\s+(.+?)(?:[.?!,]|$)/)
  if (m) {
    const d = parseDateFragment(m[1], now, 'future')
    if (d) return { from: null, to: iso(d), label: `before ${fmt(d)}` }
  }

  // --- "in <month>" → whole month ------------------------------------------
  m = q.match(/\bin\s+([a-z]+)\.?(?:\s+(\d{4}))?\b/)
  if (m && MONTHS[m[1]] !== undefined) {
    const month = MONTHS[m[1]]
    const year = m[2] ? +m[2] : resolveYear(month, now)
    const from = new Date(Date.UTC(year, month, 1))
    const to = endOfMonth(year, month)
    return { from: iso(from), to: iso(to), label: fmt(from).replace(/^1 /, '') + ' (month)' }
  }

  return none
}

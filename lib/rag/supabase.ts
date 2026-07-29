import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the SERVICE ROLE key. This bypasses RLS,
 * so it MUST only ever be imported by route handlers / server code — never in a
 * client component. Every query built on top of it is scoped by the session
 * email (see lib/rag/query.ts), which is derived from getServerSession and
 * never from request input.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

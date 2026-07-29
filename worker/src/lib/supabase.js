import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS by design. Isolation rule that replaces RLS:
// every write sets user_email from the account being processed — never from
// untrusted input. This key lives ONLY in GitHub Actions secrets.
export const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

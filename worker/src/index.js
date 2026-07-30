import { admin } from './lib/supabase.js';
import { getGmailSession } from './lib/redis.js';
import { getLlmConfig } from './lib/llm-keys.js';
import { makeProvider } from './lib/provider.js';
import {
  ensureAccessToken,
  listMessageIds,
  historySince,
  currentHistoryId,
} from './lib/gmail.js';
import { ingestMessage } from './pipeline/ingest.js';

const MODE = process.env.MODE || 'delta'; // backfill | delta
const ONLY_USER = process.env.ONLY_USER || null; // optional single-user run
const ONLY_CARD = process.env.ONLY_CARD || null; // optional single-card run

// The app writes a sync_state row when a Gmail card connects. That's the
// worker's enumeration source (Redis keys are hashed, so not enumerable back to
// user+card). Each row also holds this account's backfill/delta cursors.
async function accounts() {
  let q = admin.from('sync_state').select('*');
  if (ONLY_USER) q = q.eq('user_email', ONLY_USER);
  if (ONLY_CARD) q = q.eq('card_id', ONLY_CARD);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function tokenFor(acct) {
  const session = await getGmailSession(acct.user_email, acct.card_id);
  if (!session || session.state !== 'connected') {
    throw new Error('no connected Gmail session in Redis');
  }
  return ensureAccessToken(acct.user_email, acct.card_id, session);
}

async function runBackfill(acct, accessToken, provider) {
  const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
  for await (const { ids, nextPageToken } of listMessageIds(accessToken, {
    afterEpochSec: oneYearAgo,
    pageToken: acct.backfill_cursor || undefined,
  })) {
    for (const id of ids) {
      try {
        await ingestMessage(accessToken, acct, provider, id);
      } catch (err) {
        console.error(`[${acct.user_email}/${acct.card_id}] msg ${id}:`, err.message);
      }
    }
    await admin
      .from('sync_state')
      .update({ backfill_cursor: nextPageToken, updated_at: new Date().toISOString() })
      .eq('id', acct.id);
  }
  const hid = await currentHistoryId(accessToken);
  await admin
    .from('sync_state')
    .update({ backfill_done: true, last_history_id: hid, backfill_cursor: null })
    .eq('id', acct.id);
}

async function runDelta(acct, accessToken, provider) {
  if (!acct.last_history_id) {
    console.log(`[${acct.user_email}/${acct.card_id}] no history cursor — backfill first`);
    return;
  }
  const { ids, latestHistoryId } = await historySince(accessToken, acct.last_history_id);
  for (const id of ids) {
    try {
      await ingestMessage(accessToken, acct, provider, id);
    } catch (err) {
      console.error(`[${acct.user_email}/${acct.card_id}] msg ${id}:`, err.message);
    }
  }
  await admin
    .from('sync_state')
    .update({ last_history_id: latestHistoryId, updated_at: new Date().toISOString() })
    .eq('id', acct.id);
}

async function main() {
  const list = await accounts();
  console.log(`MODE=${MODE} accounts=${list.length}`);
  for (const acct of list) {
    try {
      const llmConfig = await getLlmConfig(acct.user_email);
      if (!llmConfig) {
        console.log(`[${acct.user_email}/${acct.card_id}] no LLM key set — skipping`);
        continue;
      }
      const provider = makeProvider(llmConfig);
      const accessToken = await tokenFor(acct);
      if (MODE === 'backfill') await runBackfill(acct, accessToken, provider);
      else await runDelta(acct, accessToken, provider);
      console.log(`[${acct.user_email}/${acct.card_id}] ${MODE} done`);
    } catch (err) {
      console.error(`[${acct.user_email}/${acct.card_id}] account failed:`, err.message);
      // continue — one account's failure must not block others
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('fatal:', err);
    process.exit(1);
  }
);

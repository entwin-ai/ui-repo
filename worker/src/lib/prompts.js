import { admin } from './supabase.js';

// Provider-agnostic prompt functions. Each takes a bound `provider` (from
// makeProvider) plus the user email for cost logging. The prompts are identical
// across vendors; only the transport differs (handled in provider.js).

async function logCost(userEmail, provider, callKind, usage) {
  await admin.from('llm_cost_log').insert({
    user_email: userEmail,
    call_kind: callKind,
    model: provider.model,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
  });
}

// LLM call 1: Write Memory Note (v4 §3).
export async function writeMemoryNote(provider, userEmail, { subject, sender, body, date }) {
  const system = `You read one email and return a Memory Note as strict JSON, no prose, no markdown.
Schema:
{
  "raw_summary": string,
  "urgency": "critical"|"high"|"medium"|"low",
  "life_domain": "personal"|"professional",
  "action": string[],
  "free_text": string,
  "confidentiality": "yes"|"no"|"blank"
}
action is a subset of ["respond","give","schedule","decision","await","none","blank"]; "none"/"blank" stand alone.`;
  const { text, usage } = await provider.chatJSON({
    system,
    user: `Date: ${date}\nFrom: ${sender}\nSubject: ${subject}\n\n${body}`,
    maxTokens: 1024,
  });
  await logCost(userEmail, provider, 'write_note', usage);
  return JSON.parse(text);
}

// LLM call 2: Extract entities.
export async function extractEntities(provider, userEmail, { subject, sender, body }) {
  const system = `Extract the people and organisations this email is about.
Return strict JSON, no prose: {"related_entities": string[]}.
Use canonical human-readable names. Do not include the mailbox owner.`;
  const { text, usage } = await provider.chatJSON({
    system,
    user: `From: ${sender}\nSubject: ${subject}\n\n${body}`,
    maxTokens: 512,
  });
  await logCost(userEmail, provider, 'extract_entities', usage);
  return JSON.parse(text).related_entities || [];
}

// Tier-2 narrow call: one-line summary + failsafe urgency check.
export async function updatesSummary(provider, userEmail, { subject, sender, body }) {
  const system = `You summarise a bank/social/transaction notification in ONE line and flag genuine urgency.
Return strict JSON, no prose: {"summary": string, "urgent": boolean}
urgent = true ONLY for a real pending action or deadline a normal update wouldn't carry.`;
  const { text, usage } = await provider.chatJSON({
    system,
    user: `From: ${sender}\nSubject: ${subject}\n\n${body}`,
    maxTokens: 256,
  });
  await logCost(userEmail, provider, 'updates_summary', usage);
  return JSON.parse(text);
}

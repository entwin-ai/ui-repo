import Anthropic from '@anthropic-ai/sdk';
import { admin } from './supabase.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

async function logCost(userEmail, callKind, usage) {
  await admin.from('llm_cost_log').insert({
    user_email: userEmail,
    call_kind: callKind,
    model: MODEL,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
  });
}

function parseJson(text) {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// LLM call 1: Write Memory Note (v4 §3) — raw_summary + 4 system-context fields.
export async function writeMemoryNote(userEmail, { subject, sender, body, date }) {
  const sys = `You read one email and return a Memory Note as strict JSON, no prose, no markdown.
Schema:
{
  "raw_summary": string,
  "urgency": "critical"|"high"|"medium"|"low",
  "life_domain": "personal"|"professional",
  "action": string[],                 // subset of ["respond","give","schedule","decision","await","none","blank"]; "none"/"blank" stand alone
  "free_text": string,
  "confidentiality": "yes"|"no"|"blank"
}`;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: sys,
    messages: [
      { role: 'user', content: `Date: ${date}\nFrom: ${sender}\nSubject: ${subject}\n\n${body}` },
    ],
  });
  await logCost(userEmail, 'write_note', res.usage);
  return parseJson(res.content[0].text);
}

// LLM call 2: Extract entities (candidate related_entities).
export async function extractEntities(userEmail, { subject, sender, body }) {
  const sys = `Extract the people and organisations this email is about.
Return strict JSON, no prose: {"related_entities": string[]}.
Use canonical human-readable names. Do not include the mailbox owner.`;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: sys,
    messages: [
      { role: 'user', content: `From: ${sender}\nSubject: ${subject}\n\n${body}` },
    ],
  });
  await logCost(userEmail, 'extract_entities', res.usage);
  return parseJson(res.content[0].text).related_entities || [];
}

// Tier-2 narrow call: one-line summary + failsafe urgency check.
export async function updatesSummary(userEmail, { subject, sender, body }) {
  const sys = `You summarise a bank/social/transaction notification in ONE line and flag genuine urgency.
Return strict JSON, no prose: {"summary": string, "urgent": boolean}
urgent = true ONLY for a real pending action or deadline a normal update wouldn't carry.`;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: sys,
    messages: [
      { role: 'user', content: `From: ${sender}\nSubject: ${subject}\n\n${body}` },
    ],
  });
  await logCost(userEmail, 'updates_summary', res.usage);
  return parseJson(res.content[0].text);
}

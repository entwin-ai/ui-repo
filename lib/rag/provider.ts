import type { LlmConfig, LlmProvider } from './llm-keys'

/**
 * LLM-agnostic provider layer (TypeScript port of worker/src/lib/provider.js).
 * Used by the /api/ask query path. Each provider does chat + embeddings;
 * embeddings are normalized to 1536 dims to match the vector column.
 */

const TARGET_DIM = 1536

const CHAT_MODEL_ID: Record<LlmProvider, Record<string, string>> = {
  claude: {
    'Claude Opus 4.8 (latest)': 'claude-opus-4-8',
    'Claude Sonnet 5 (latest)': 'claude-sonnet-5',
    'Claude Haiku 4.5 (latest)': 'claude-haiku-4-5-20251001',
  },
  openai: {
    'GPT-5.6 Sol (latest)': 'gpt-5.6-sol',
    'GPT-5.6 Terra (latest)': 'gpt-5.6-terra',
    'GPT-5.6 Luna (latest)': 'gpt-5.6-luna',
  },
  gemini: {
    'Gemini 3.1 Pro (latest)': 'gemini-3.1-pro',
    'Gemini 3.6 Flash (latest)': 'gemini-3.6-flash',
    'Gemini 3.5 Flash-Lite (latest)': 'gemini-3.5-flash-lite',
  },
}

// Embedding model per provider — config-driven (Option A). Override via env
// vars; fallbacks are current sensible defaults.
const EMBED_MODEL_ID: Record<LlmProvider, string> = {
  claude: process.env.CLAUDE_EMBED_MODEL || 'voyage-3',
  openai: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  gemini: process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
}

function resolveChatModel(provider: LlmProvider, label: string): string {
  return CHAT_MODEL_ID[provider]?.[label] || label
}

function normalizeDim(vec: number[]): number[] {
  if (vec.length === TARGET_DIM) return vec
  if (vec.length > TARGET_DIM) return vec.slice(0, TARGET_DIM)
  return vec.concat(new Array(TARGET_DIM - vec.length).fill(0))
}

function stripJson(text: string): string {
  return text.replace(/```json|```/g, '').trim()
}

interface ChatArgs {
  system: string
  user: string
  maxTokens: number
}

export interface BoundProvider {
  provider: LlmProvider
  model: string
  chatText: (args: ChatArgs) => Promise<string>
  embed: (text: string) => Promise<number[]>
}

async function claudeChat(apiKey: string, model: string, a: ChatArgs): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: a.maxTokens,
      system: a.system,
      messages: [{ role: 'user', content: a.user }],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const j = await res.json()
  return j.content[0].text
}

async function openaiChat(apiKey: string, model: string, a: ChatArgs): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: a.maxTokens,
      messages: [
        { role: 'system', content: a.system },
        { role: 'user', content: a.user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  const j = await res.json()
  return j.choices[0].message.content
}

async function geminiChat(apiKey: string, model: string, a: ChatArgs): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: [{ role: 'user', parts: [{ text: a.user }] }],
      generationConfig: { maxOutputTokens: a.maxTokens },
    }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const j = await res.json()
  return j.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function claudeEmbed(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL_ID.claude, input: text }),
  })
  if (!res.ok) throw new Error(`voyage ${res.status}`)
  const j = await res.json()
  return normalizeDim(j.data[0].embedding)
}

async function openaiEmbed(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL_ID.openai, input: text }),
  })
  if (!res.ok) throw new Error(`openai-embed ${res.status}`)
  const j = await res.json()
  return normalizeDim(j.data[0].embedding)
}

async function geminiEmbed(apiKey: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL_ID.gemini}:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  })
  if (!res.ok) throw new Error(`gemini-embed ${res.status}`)
  const j = await res.json()
  return normalizeDim(j.embedding.values)
}

export function makeProvider(config: LlmConfig): BoundProvider {
  const { provider, model, apiKey } = config
  const chatModel = resolveChatModel(provider, model)
  if (provider === 'claude') {
    return {
      provider,
      model: chatModel,
      chatText: (a) => claudeChat(apiKey, chatModel, a),
      embed: (t) => claudeEmbed(apiKey, t),
    }
  }
  if (provider === 'openai') {
    return {
      provider,
      model: chatModel,
      chatText: (a) => openaiChat(apiKey, chatModel, a),
      embed: (t) => openaiEmbed(apiKey, t),
    }
  }
  if (provider === 'gemini') {
    return {
      provider,
      model: chatModel,
      chatText: (a) => geminiChat(apiKey, chatModel, a),
      embed: (t) => geminiEmbed(apiKey, t),
    }
  }
  throw new Error(`unsupported provider: ${provider}`)
}

export { stripJson }

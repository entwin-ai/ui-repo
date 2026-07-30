// LLM-agnostic provider layer. One interface, three adapters. The pipeline
// calls chatJSON()/embed() and never touches a vendor SDK directly.
//
// Each provider must support BOTH chat and embeddings (per product decision).
// All embeddings are normalized to 1536 dims (pad with zeros / truncate) so they
// fit the fixed vector(1536) column regardless of the provider's native size.

const TARGET_DIM = 1536;

// Model maps: the settings UI shows friendly labels; map the CHAT label to an
// API model id, and pick a sensible embedding model per provider.
const CHAT_MODEL_ID = {
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
};

// Embedding model per provider — CONFIG-DRIVEN (Option A). Override any of these
// via env vars without a code change; the fallbacks are current sensible
// defaults. This is the one place model names live for embeddings.
const EMBED_MODEL_ID = {
  claude: process.env.CLAUDE_EMBED_MODEL || 'voyage-3',
  openai: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  gemini: process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
};

function resolveChatModel(provider, label) {
  return CHAT_MODEL_ID[provider]?.[label] || label;
}

function normalizeDim(vec) {
  if (vec.length === TARGET_DIM) return vec;
  if (vec.length > TARGET_DIM) return vec.slice(0, TARGET_DIM);
  return vec.concat(new Array(TARGET_DIM - vec.length).fill(0));
}

function stripJson(text) {
  return text.replace(/```json|```/g, '').trim();
}

// ---- CLAUDE (Anthropic messages API; embeddings via Voyage) -----------------
const claude = {
  async chatJSON({ apiKey, model, system, user, maxTokens }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    return {
      text: stripJson(json.content[0].text),
      usage: {
        input_tokens: json.usage?.input_tokens,
        output_tokens: json.usage?.output_tokens,
      },
    };
  },
  async embed({ apiKey, text }) {
    // Voyage AI — the embedding provider Anthropic points BYOK users to.
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL_ID.claude, input: text }),
    });
    if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    return normalizeDim(json.data[0].embedding);
  },
};

// ---- OPENAI -----------------------------------------------------------------
const openai = {
  async chatJSON({ apiKey, model, system, user, maxTokens }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    return {
      text: stripJson(json.choices[0].message.content),
      usage: {
        input_tokens: json.usage?.prompt_tokens,
        output_tokens: json.usage?.completion_tokens,
      },
    };
  },
  async embed({ apiKey, text }) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL_ID.openai, input: text }),
    });
    if (!res.ok) throw new Error(`openai-embed ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    return normalizeDim(json.data[0].embedding);
  },
};

// ---- GEMINI (Google Generative Language API) --------------------------------
const gemini = {
  async chatJSON({ apiKey, model, system, user, maxTokens }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      text: stripJson(text),
      usage: {
        input_tokens: json.usageMetadata?.promptTokenCount,
        output_tokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  },
  async embed({ apiKey, text }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL_ID.gemini}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
    });
    if (!res.ok) throw new Error(`gemini-embed ${res.status}: ${await res.text().catch(() => '')}`);
    const json = await res.json();
    return normalizeDim(json.embedding.values);
  },
};

const ADAPTERS = { claude, openai, gemini };

// Public factory: given a user's config, return bound chat/embed callables.
export function makeProvider(config) {
  const { provider, model, apiKey } = config;
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`unsupported provider: ${provider}`);
  const chatModel = resolveChatModel(provider, model);
  return {
    provider,
    model: chatModel,
    chatJSON: (args) => adapter.chatJSON({ apiKey, model: chatModel, ...args }),
    embed: (text) => adapter.embed({ apiKey, text }),
  };
}

export { TARGET_DIM };

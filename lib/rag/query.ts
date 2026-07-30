import { getSupabaseAdmin } from './supabase'
import { getLlmConfig } from './llm-keys'
import { makeProvider } from './provider'

/**
 * RAG retrieval + answer, provider-agnostic. The user's LLM key/provider is
 * loaded from the encrypted Redis store; the same key does both the query
 * embedding and the answer generation. `userEmail` is the hard isolation scope.
 */

export interface AskSource {
  n: number
  url: string | null
  date: string | null
  urgency: string | null
  similarity: number
}

export interface AskResult {
  answer: string
  sources: AskSource[]
}

export class NoLlmKeyError extends Error {
  constructor() {
    super('No LLM key configured. Set one in Settings.')
    this.name = 'NoLlmKeyError'
  }
}

export async function ask(
  userEmail: string,
  question: string,
  cardId: string | null = null,
): Promise<AskResult> {
  const config = await getLlmConfig(userEmail)
  if (!config) throw new NoLlmKeyError()
  const provider = makeProvider(config)

  const queryEmbedding = await provider.embed(question)

  const { data: matches, error } = await getSupabaseAdmin().rpc('match_note_chunks', {
    p_user_email: userEmail, // HARD user scope
    query_embedding: queryEmbedding,
    match_count: 12, // higher, since one email can now span several chunks
    p_card_id: cardId,
  })
  if (error) throw new Error(error.message)

  if (!matches || matches.length === 0) {
    return { answer: "I couldn't find anything in your email memory about that.", sources: [] }
  }

  // All retrieved chunks feed the LLM as context (more detail = better answers).
  const context = matches
    .map((m: any, i: number) => `[${i + 1}] (${m.note_date}, urgency=${m.urgency})\n${m.content}`)
    .join('\n\n')

  const answer = await provider.chatText({
    system:
      'Answer the question using ONLY the provided email memory notes. Cite sources as [n]. If the notes do not contain the answer, say so plainly.',
    user: `Question: ${question}\n\nMemory notes:\n${context}`,
    maxTokens: 1024,
  })

  // Sources shown to the user are deduped by email (gmail_msg_id): several
  // chunks may come from the same message, but the user should see one link per
  // email, numbered in first-appearance order.
  const seen = new Set<string>()
  const sources: AskSource[] = []
  let n = 0
  for (const m of matches as any[]) {
    const key = m.gmail_msg_id || m.source_url || String(m.note_id)
    if (seen.has(key)) continue
    seen.add(key)
    n += 1
    sources.push({ n, url: m.source_url, date: m.note_date, urgency: m.urgency, similarity: m.similarity })
  }

  return { answer, sources }
}

/**
 * Wiki RAG: "what do I know about entity X?" Retrieves chunks only from notes
 * that mention the given entity (via match_entity_chunks), then answers with the
 * user's LLM. Same isolation guarantees as ask().
 */
export async function askEntity(
  userEmail: string,
  entityId: string,
  question: string,
): Promise<AskResult> {
  const config = await getLlmConfig(userEmail)
  if (!config) throw new NoLlmKeyError()
  const provider = makeProvider(config)

  const queryEmbedding = await provider.embed(question)

  const { data: matches, error } = await getSupabaseAdmin().rpc('match_entity_chunks', {
    p_user_email: userEmail,
    p_entity_id: entityId,
    query_embedding: queryEmbedding,
    match_count: 12,
  })
  if (error) throw new Error(error.message)

  if (!matches || matches.length === 0) {
    return { answer: "I don't have anything in your email memory about that yet.", sources: [] }
  }

  const context = (matches as any[])
    .map((m, i) => `[${i + 1}] (${m.note_date}, urgency=${m.urgency})\n${m.content}`)
    .join('\n\n')

  const answer = await provider.chatText({
    system:
      'You are summarising what the user knows about a specific person or organisation, using ONLY the provided email memory notes. Cite sources as [n]. If the notes do not answer, say so plainly.',
    user: `Question: ${question}\n\nMemory notes:\n${context}`,
    maxTokens: 1024,
  })

  const seen = new Set<string>()
  const sources: AskSource[] = []
  let n = 0
  for (const m of matches as any[]) {
    const key = m.gmail_msg_id || m.source_url || String(m.note_id)
    if (seen.has(key)) continue
    seen.add(key)
    n += 1
    sources.push({ n, url: m.source_url, date: m.note_date, urgency: m.urgency, similarity: m.similarity })
  }

  return { answer, sources }
}

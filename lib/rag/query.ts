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
    match_count: 8,
    p_card_id: cardId,
  })
  if (error) throw new Error(error.message)

  if (!matches || matches.length === 0) {
    return { answer: "I couldn't find anything in your email memory about that.", sources: [] }
  }

  const context = matches
    .map((m: any, i: number) => `[${i + 1}] (${m.note_date}, urgency=${m.urgency})\n${m.content}`)
    .join('\n\n')

  const answer = await provider.chatText({
    system:
      'Answer the question using ONLY the provided email memory notes. Cite sources as [n]. If the notes do not contain the answer, say so plainly.',
    user: `Question: ${question}\n\nMemory notes:\n${context}`,
    maxTokens: 1024,
  })

  return {
    answer,
    sources: matches.map((m: any, i: number) => ({
      n: i + 1,
      url: m.source_url,
      date: m.note_date,
      urgency: m.urgency,
      similarity: m.similarity,
    })),
  }
}

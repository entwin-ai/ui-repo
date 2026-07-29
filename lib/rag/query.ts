import { supabaseAdmin } from './supabase'

/**
 * The RAG retrieval + answer path. Isolation: `userEmail` is always passed by
 * the caller from getServerSession — never from the request body — and is the
 * hard filter inside the match_note_chunks RPC.
 */

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const EMBED_MODEL = 'text-embedding-3-small'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'

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

async function embed(text: string): Promise<number[]> {
  const res = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })
  if (!res.ok) throw new Error(`embedding failed: ${res.status}`)
  const json = await res.json()
  return json.data[0].embedding
}

export async function ask(
  userEmail: string,
  question: string,
  cardId: string | null = null,
): Promise<AskResult> {
  const queryEmbedding = await embed(question)

  const { data: matches, error } = await supabaseAdmin.rpc('match_note_chunks', {
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
    .map(
      (m: any, i: number) =>
        `[${i + 1}] (${m.note_date}, urgency=${m.urgency})\n${m.content}`,
    )
    .join('\n\n')

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system:
        'Answer the question using ONLY the provided email memory notes. Cite sources as [n]. If the notes do not contain the answer, say so plainly.',
      messages: [
        { role: 'user', content: `Question: ${question}\n\nMemory notes:\n${context}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`anthropic failed: ${res.status}`)
  const json = await res.json()

  return {
    answer: json.content[0].text,
    sources: matches.map((m: any, i: number) => ({
      n: i + 1,
      url: m.source_url,
      date: m.note_date,
      urgency: m.urgency,
      similarity: m.similarity,
    })),
  }
}

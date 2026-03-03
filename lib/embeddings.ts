import OpenAI from 'openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

// Use OpenAI for embeddings only. Groq's nomic-embed-text-v1_5 returns 404 for most API keys.
const openai: OpenAI | null =
  process.env.OPENAI_API_KEY != null && process.env.OPENAI_API_KEY !== ''
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null

// When OpenAI returns 429 (quota exceeded), stop calling so we don't spam errors or waste time.
let quotaExceeded = false

export function hasEmbeddingSupport(): boolean {
  return openai != null && !quotaExceeded
}

/**
 * Returns embedding vector (1536 dims for text-embedding-3-small) or null if OpenAI is not configured or quota exceeded.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!openai || quotaExceeded || !text.trim()) return null
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim().slice(0, 8192),
    })
    const vec = res.data[0]?.embedding
    return Array.isArray(vec) && vec.length === EMBEDDING_DIM ? vec : null
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; error?: { code?: string } }
    const isQuota = err?.status === 429 || err?.code === 'insufficient_quota' || err?.error?.code === 'insufficient_quota'
    if (isQuota) {
      quotaExceeded = true
      console.warn('OpenAI embedding quota exceeded; semantic cache disabled for this process. Exact-key cache still works.')
    } else {
      console.error('Embedding error:', e)
    }
    return null
  }
}

export { EMBEDDING_DIM }

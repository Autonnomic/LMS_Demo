/**
 * Ollama-based embeddings for RAG (nomic-embed-text, 768 dimensions).
 * Used by course-materials search and assistant RAG.
 */
const EMBED_DIM = 768
const OLLAMA_EMBED_URL = process.env.OLLAMA_EMBED_URL || 'http://127.0.0.1:11434/api/embed'
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

export { EMBED_DIM }

export async function getOllamaEmbedding(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, input: text }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ollama embedding failed (${res.status}): ${err}. Run: ollama run ${OLLAMA_MODEL}`)
  }
  const data = await res.json()
  const vec = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding
  if (!Array.isArray(vec)) {
    throw new Error('Ollama returned no embedding. Use OLLAMA_EMBED_URL with /api/embed.')
  }
  if (vec.length === 0) {
    throw new Error('Ollama returned empty embedding. Set OLLAMA_EMBED_URL=http://127.0.0.1:11434/api/embed')
  }
  if (vec.length !== EMBED_DIM) {
    throw new Error(`Ollama returned embedding length ${vec.length}; expected ${EMBED_DIM} (nomic-embed-text).`)
  }
  return vec
}

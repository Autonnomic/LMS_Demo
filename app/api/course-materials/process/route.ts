import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'

const EMBED_DIM = 768 // nomic-embed-text
const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50
const OLLAMA_EMBED_URL = process.env.OLLAMA_EMBED_URL || 'http://127.0.0.1:11434/api/embed'
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

/** Extract main keyword from chunk: first 6 non-empty words. */
function mainKeywordFromChunk(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 6)
  return words.join(' ').slice(0, 100) || ''
}

/** Split text into overlapping chunks. */
function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return chunks
  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE
    if (end < cleaned.length) {
      const nextSpace = cleaned.lastIndexOf(' ', end)
      if (nextSpace > start) end = nextSpace + 1
    }
    const chunk = cleaned.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start = end - CHUNK_OVERLAP
    if (start >= cleaned.length) break
  }
  return chunks
}

/** Get embedding vector from local Ollama. */
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, input: text }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ollama embedding failed (${res.status}): ${err}. Run locally: ollama run ${OLLAMA_MODEL}`)
  }
  const data = await res.json()
  // Support both /api/embed (embeddings[]) and /api/embeddings (embedding)
  const vec = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding
  if (!Array.isArray(vec)) {
    throw new Error('Ollama returned no embedding. Check OLLAMA_EMBED_URL and that the model supports embeddings.')
  }
  if (vec.length === 0) {
    throw new Error(
      `Ollama returned an empty embedding. Use the /api/embed endpoint: set OLLAMA_EMBED_URL=http://127.0.0.1:11434/api/embed (the deprecated /api/embeddings often returns empty).`
    )
  }
  if (vec.length !== EMBED_DIM) {
    throw new Error(
      `Ollama returned embedding with length ${vec.length}; this app expects ${EMBED_DIM} (nomic-embed-text). ` +
        `Use \`ollama run nomic-embed-text\` and OLLAMA_EMBED_MODEL=nomic-embed-text, or change EMBED_DIM and the DB vector size.`
    )
  }
  return vec
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const materialId = body.materialId ?? body.material_id
    if (!materialId) {
      return NextResponse.json({ error: 'Missing materialId' }, { status: 400 })
    }

    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabaseAuth = token
      ? createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
      : await import('@/lib/supabase/server').then((m) => m.createClient())

    const supabase = supabaseAuth
    const { data: material, error: matError } = await supabase
      .from('course_materials')
      .select('id, course_id, file_path, file_name')
      .eq('id', materialId)
      .single()

    if (matError || !material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 })
    }

    const { data: course } = await supabase
      .from('courses')
      .select('professor_id')
      .eq('id', material.course_id)
      .single()

    if (!course || course.professor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) {
      return NextResponse.json(
        { error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY required for processing' },
        { status: 500 }
      )
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)
    const { data: fileData, error: downloadError } = await admin.storage
      .from('course-materials')
      .download(material.file_path)

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: 'Failed to download PDF: ' + (downloadError?.message || 'unknown') },
        { status: 400 }
      )
    }

    let text: string
    try {
      const pdfParseModule = await import('pdf-parse')
      const pdfParse = (typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule) as (dataBuffer: Buffer) => Promise<{ text?: string }>
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const result = await pdfParse(buffer)
      text = result?.text ?? ''
    } catch (pdfErr: any) {
      const msg = pdfErr?.message || String(pdfErr)
      return NextResponse.json(
        { error: msg.includes('Cannot find module') ? 'PDF parser not installed. Run: npm install pdf-parse' : `PDF extraction failed: ${msg}` },
        { status: 500 }
      )
    }
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'No text extracted from PDF' }, { status: 400 })
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks produced from PDF text' }, { status: 400 })
    }

    const embeddings: number[][] = []
    for (const chunk of chunks) {
      const vec = await getEmbedding(chunk)
      embeddings.push(vec)
    }

    const rows = chunks.map((content, i) => ({
      course_id: material.course_id,
      material_id: material.id,
      content,
      main_keyword: mainKeywordFromChunk(content),
      chunk_index: i,
      embedding: embeddings[i],
    }))

    const { error: insertError } = await supabase.from('document_chunks').insert(rows)

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to store chunks: ' + insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      chunks: chunks.length,
      message: `Stored ${chunks.length} chunks with embeddings for fast similarity search.`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error'
    console.error('course-materials/process:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

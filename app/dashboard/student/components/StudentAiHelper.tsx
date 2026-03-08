'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface StudentAiHelperProps {
  userId: string
}

interface AssistantResponse {
  mode: 'simple' | 'rag'
  answer: string
}

export default function StudentAiHelper({ userId }: StudentAiHelperProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [mode, setMode] = useState<'simple' | 'rag' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAsk() {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    setMode(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/assistant', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ question: q }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Failed to get an answer. Please try again.')
        return
      }

      const data = (await res.json()) as AssistantResponse
      setAnswer(data.answer)
      setMode(data.mode)
    } catch (e) {
      console.error('Student AI helper error:', e)
      setError('Unexpected error while contacting the assistant.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--navy-dark)',
              marginBottom: '0.15rem',
            }}
          >
            AI study helper
          </h2>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
            }}
          >
            Ask quick questions. Course-specific answers use RAG when available.
          </p>
        </div>
        {mode && (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              background:
                mode === 'rag'
                  ? 'rgba(8,146,165,0.12)'
                  : 'rgba(37,99,235,0.08)',
              color: mode === 'rag' ? 'var(--teal-bright)' : '#2563EB',
            }}
          >
            {mode === 'rag' ? 'RAG' : 'Direct'}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-start',
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Explain big-O notation, or ask about your courses."
          rows={2}
          style={{
            flex: 1,
            resize: 'vertical',
            minHeight: '60px',
            maxHeight: '140px',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
            outline: 'none',
            background: 'var(--bg)',
          }}
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          style={{
            whiteSpace: 'nowrap',
            padding: '0.6rem 0.9rem',
            borderRadius: '999px',
            border: 'none',
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            background: loading ? 'var(--text-muted)' : 'var(--teal-bright)',
            color: 'white',
            alignSelf: 'stretch',
          }}
        >
          {loading ? 'Thinking...' : 'Ask AI'}
        </button>
      </div>

      {error && (
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--error)',
            marginTop: '0.25rem',
          }}
        >
          {error}
        </div>
      )}

      {answer && (
        <div
          style={{
            marginTop: '0.35rem',
            padding: '0.75rem 0.85rem',
            borderRadius: '8px',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
            color: 'var(--text)',
            maxHeight: '220px',
            overflowY: 'auto',
            lineHeight: 1.4,
          }}
        >
          {answer}
        </div>
      )}
    </section>
  )
}

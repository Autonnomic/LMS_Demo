'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'simple' | 'rag'
}

interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: string
}

interface AssistantResponse {
  mode: 'simple' | 'rag'
  answer: string
  usage?: {
    dailyLimit: number
    questionsUsed: number
  }
}

function chatTitleFromFirstMessage(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser?.content?.trim() ?? 'New chat'
  return text.length > 42 ? text.slice(0, 42) + '…' : text
}

function rowToChat(row: { id: string; title: string; messages: unknown; created_at: string }): Chat {
  const messages = Array.isArray(row.messages) ? (row.messages as Message[]) : []
  return {
    id: row.id,
    title: row.title,
    messages,
    createdAt: row.created_at,
  }
}

interface AiHelperChatProps {
  userId?: string
}

export default function AiHelperChat({ userId }: AiHelperChatProps) {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [draftMessages, setDraftMessages] = useState<Message[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usagePercent, setUsagePercent] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeChat = activeChatId ? chats.find((c) => c.id === activeChatId) : null
  const messages = activeChat ? activeChat.messages : draftMessages

  useEffect(() => {
    if (!userId) return
    async function load() {
      const { data, error } = await supabase
        .from('ai_helper_chats')
        .select('id, title, messages, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Failed to load AI helper chats:', error)
        return
      }
      setChats((data ?? []).map(rowToChat))
    }
    load()
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleNewChat() {
    setActiveChatId(null)
    setDraftMessages([])
    setError(null)
    setInput('')
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id)
    setError(null)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    if (!userId) {
      setError('You must be signed in to save chats.')
      return
    }

    setInput('')
    setError(null)
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }
    const isNewChat = !activeChatId
    const messagesAfterUser = [...messages, userMessage]

    if (isNewChat) {
      setDraftMessages(messagesAfterUser)
    } else {
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, messages: messagesAfterUser } : c))
      )
    }
    setLoading(true)

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

      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/assistant', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ question: text, history }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Failed to get an answer. Please try again.')
        if (isNewChat) setDraftMessages((prev) => prev.slice(0, -1))
        return
      }

      const data = (await res.json()) as AssistantResponse
      if (data.usage && data.usage.dailyLimit > 0) {
        const percent = (data.usage.questionsUsed / data.usage.dailyLimit) * 100
        setUsagePercent(percent)
      }
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        mode: data.mode,
      }
      const finalMessages = [...messagesAfterUser, assistantMessage]

      if (isNewChat) {
        const title = chatTitleFromFirstMessage([userMessage])
        const { data: row, error: insertError } = await supabase
          .from('ai_helper_chats')
          .insert({
            user_id: userId,
            title,
            messages: finalMessages,
          })
          .select('id, title, messages, created_at')
          .single()

        if (insertError || !row) {
          console.error('Failed to save new chat:', insertError)
          setError('Failed to save chat.')
          setDraftMessages((prev) => prev.slice(0, -1))
          return
        }
        const newChat = rowToChat(row)
        setChats((prev) => [newChat, ...prev])
        setActiveChatId(newChat.id)
        setDraftMessages([])
      } else {
        const { error: updateError } = await supabase
          .from('ai_helper_chats')
          .update({ messages: finalMessages, updated_at: new Date().toISOString() })
          .eq('id', activeChatId)
          .eq('user_id', userId)

        if (updateError) {
          console.error('Failed to update chat:', updateError)
          setError('Failed to save message.')
          return
        }
        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, messages: finalMessages } : c))
        )
      }
    } catch (e) {
      console.error('AI helper error:', e)
      setError('Unexpected error while contacting the assistant.')
      if (isNewChat) setDraftMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const sortedChats = [...chats].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 'calc(100vh - 120px)',
        maxHeight: 'calc(100vh - 120px)',
        background: 'var(--bg)',
      }}
    >
      {/* Collapsible chat sidebar */}
      <aside
        style={{
          width: sidebarCollapsed ? 52 : 260,
          minWidth: sidebarCollapsed ? 52 : 260,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: sidebarCollapsed ? '0.75rem' : '0.75rem 0.75rem 0.5rem',
            borderBottom: sidebarCollapsed ? 'none' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={handleNewChat}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--teal-bright)',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              padding: '0.5rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-hover)',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {!sidebarCollapsed && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.5rem 0',
            }}
          >
            {sortedChats.length === 0 ? (
              <div
                style={{
                  padding: '1rem 0.75rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                No chats yet. Start a new chat.
              </div>
            ) : (
              sortedChats.map((chat: Chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleSelectChat(chat.id)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: activeChatId === chat.id ? 'var(--surface-hover)' : 'transparent',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontWeight: activeChatId === chat.id ? 600 : 400 }}>{chat.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(chat.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </aside>

      {/* Main chat area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {usagePercent !== null && usagePercent >= 90 && usagePercent < 100 && (
          <div
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '0.8rem',
              color: 'var(--text)',
              background: 'rgba(245, 158, 11, 0.1)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
            }}
          >
            You have used {Math.round(usagePercent)}% of your daily AI question limit.
          </div>
        )}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                textAlign: 'center',
                padding: '2rem',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</div>
              <div style={{ fontWeight: 500, color: 'var(--text)' }}>AI study helper</div>
              <div>Ask anything — general concepts or course-specific (RAG when available).</div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '18px',
                  maxWidth: '100%',
                  ...(m.role === 'user'
                    ? {
                        background: 'var(--teal-bright)',
                        color: 'white',
                        borderBottomRightRadius: 4,
                      }
                    : {
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        borderBottomLeftRadius: 4,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }),
                }}
              >
                {m.role === 'assistant' ? (
                  <div
                    className="ai-helper-markdown"
                    style={{ fontSize: '0.9rem', lineHeight: 1.6 }}
                  >
                    <ReactMarkdown
                      components={{
                        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                        p: ({ children }) => <div style={{ margin: '0 0 0.5em 0' }}>{children}</div>,
                        ul: ({ children }) => <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>{children}</ol>,
                        li: ({ children }) => <li style={{ marginBottom: '0.2em' }}>{children}</li>,
                        h1: ({ children }) => <h1 style={{ fontSize: '1.1em', fontWeight: 700, margin: '0.5em 0 0.25em 0' }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: '1.05em', fontWeight: 700, margin: '0.5em 0 0.25em 0' }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0.4em 0 0.2em 0' }}>{children}</h3>,
                        code: (props) => {
                          const { node, className, children, ...rest } = props
                          const inline = 'inline' in props ? (props as { inline?: boolean }).inline : false
                          return inline ? (
                            <code style={{ background: 'var(--surface-hover)', padding: '0.15em 0.4em', borderRadius: 4, fontSize: '0.9em' }} {...rest}>{children}</code>
                          ) : (
                            <pre style={{ background: 'var(--surface-hover)', padding: '0.5rem 0.75rem', borderRadius: 6, overflow: 'auto', fontSize: '0.85em', margin: '0.5em 0' }}>
                              <code {...rest}>{children}</code>
                            </pre>
                          )
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                )}
                {m.role === 'assistant' && m.mode && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                      {m.mode === 'rag' ? 'RAG' : 'Direct'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '0.75rem 1rem',
                borderRadius: '18px',
                borderBottomLeftRadius: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
              }}
            >
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '0.8rem',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-end',
              maxWidth: '48rem',
              margin: '0 auto',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Type here"
              rows={1}
              style={{
                flex: 1,
                minHeight: '44px',
                maxHeight: '120px',
                padding: '0.65rem 1rem',
                borderRadius: '22px',
                border: '1px solid var(--border)',
                fontSize: '0.9rem',
                outline: 'none',
                resize: 'none',
                background: 'var(--bg)',
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: '22px',
                border: 'none',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
                background: loading || !input.trim() ? 'var(--text-muted)' : 'var(--teal-bright)',
                color: 'white',
              }}
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

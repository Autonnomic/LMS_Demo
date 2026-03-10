'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'
import UserMenu from '../../components/UserMenu'

interface Reply {
  id: string
  body: string
  created_at: string
  author: {
    first_name: string | null
    last_name: string | null
  } | null
}

interface Thread {
  id: string
  title: string
  body: string
  created_at: string
  author: {
    first_name: string | null
    last_name: string | null
  } | null
  replies: Reply[]
}

interface SidebarCourse {
  id: string
  code: string
  name: string
}

export default function StudentDiscussionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<Thread[]>([])
  const [courses, setCourses] = useState<SidebarCourse[]>([])
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [postingThread, setPostingThread] = useState(false)
  const [postingReplyId, setPostingReplyId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'student') {
        router.replace('/dashboard')
        return
      }

      const first = (profile.first_name || '').trim()
      const last = (profile.last_name || '').trim()
      setUserName([first, last].filter(Boolean).join(' ') || 'Student')
      setUserInitials((first.charAt(0) + last.charAt(0)).toUpperCase() || 'S')

      // Enrolled courses for sidebar
      const { data: regs } = await supabase
        .from('course_registrations')
        .select('course:courses(id, code, name)')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      const courseList =
        (regs || [])
          .map((r: any) => r.course as SidebarCourse | null)
          .filter(Boolean) ?? []
      setCourses(courseList)

      await fetchThreads()
    } finally {
      setLoading(false)
    }
  }

  async function fetchThreads() {
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const res = await fetch('/api/student/discussions', {
      method: 'GET',
      credentials: 'include',
      headers,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error || 'Could not load discussions.')
      return
    }
    const json = await res.json().catch(() => ({}))
    const list = Array.isArray(json.threads) ? (json.threads as Thread[]) : []
    setThreads(list)
  }

  async function handlePostThread() {
    if (!newTitle.trim() || !newBody.trim() || postingThread) return
    setPostingThread(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch('/api/student/discussions', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not post discussion.')
        return
      }
      setNewTitle('')
      setNewBody('')
      await fetchThreads()
    } finally {
      setPostingThread(false)
    }
  }

  async function handlePostReply(threadId: string) {
    const draft = (replyDrafts[threadId] || '').trim()
    if (!draft || postingReplyId) return
    setPostingReplyId(threadId)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/student/discussions/${threadId}/replies`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ body: draft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not post reply.')
        return
      }
      setReplyDrafts((prev) => ({ ...prev, [threadId]: '' }))
      await fetchThreads()
    } finally {
      setPostingReplyId(null)
    }
  }

  function formatName(author: Thread['author'] | Reply['author']): string {
    if (!author) return 'Student'
    const first = (author.first_name || '').trim()
    const last = (author.last_name || '').trim()
    const full = [first, last].filter(Boolean).join(' ')
    return full || 'Student'
  }

  function formatTime(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
  }

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <span className="canvas-topbar-title">Discussions</span>
            </div>
            <div className="canvas-content-area">
              <div className="skeleton-card skeleton" style={{ height: '220px', borderRadius: '16px' }} />
              <div className="skeleton-card skeleton" style={{ height: '220px', borderRadius: '16px', marginTop: '1rem' }} />
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <Sidebar courses={courses} />
        <main className="canvas-main-content">
          <div className="canvas-topbar">
            <span className="canvas-topbar-title">Discussions</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Notifications />
              <UserMenu
                userName={userName}
                userInitials={userInitials}
                onLogout={async () => {
                  const { logout } = await import('@/lib/auth')
                  await logout()
                  router.push('/')
                  router.refresh()
                }}
              />
            </div>
          </div>

          <div className="canvas-content-area">
            <section
              style={{
                marginBottom: '1.5rem',
                padding: '1.25rem 1.25rem 1rem',
                background: 'var(--surface-hover)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                Start a discussion
              </h2>
              {error && (
                <div className="auth-error" style={{ marginBottom: '0.75rem' }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Question title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Describe your question or topic..."
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', padding: '0.5rem 1.25rem', alignSelf: 'flex-end' }}
                  disabled={postingThread || !newTitle.trim() || !newBody.trim()}
                  onClick={handlePostThread}
                >
                  {postingThread ? 'Posting…' : 'Post question'}
                </button>
              </div>
            </section>

            <section>
              {threads.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No discussions yet. Be the first to ask a question.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {threads.map((thread) => {
                    const firstReplies = thread.replies.slice(0, 3)
                    const remainingReplies = thread.replies.slice(3)
                    return (
                      <article
                        key={thread.id}
                        style={{
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          padding: '1rem 1.1rem',
                        }}
                      >
                        <header style={{ marginBottom: '0.75rem' }}>
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--navy-dark)' }}>
                            {thread.title}
                          </h3>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              gap: '0.5rem',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span>{formatName(thread.author)}</span>
                            <span aria-hidden>•</span>
                            <time dateTime={thread.created_at}>{formatTime(thread.created_at)}</time>
                          </div>
                        </header>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}>
                          {thread.body}
                        </p>

                        <div
                          style={{
                            borderTop: '1px solid var(--border)',
                            paddingTop: '0.5rem',
                            marginTop: '0.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Replies ({thread.replies.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {firstReplies.map((reply) => (
                              <div key={reply.id} style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                                <div style={{ marginBottom: '0.15rem' }}>
                                  <span style={{ fontWeight: 500 }}>{formatName(reply.author)}</span>{' '}
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    • <time dateTime={reply.created_at}>{formatTime(reply.created_at)}</time>
                                  </span>
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{reply.body}</div>
                              </div>
                            ))}
                          </div>
                          {remainingReplies.length > 0 && (
                            <div
                              style={{
                                height: '80px', // show ~1 reply, rest scrollable
                                overflowY: 'auto',
                                paddingTop: '0.25rem',
                                marginTop: '0.15rem',
                                borderTop: '1px dashed var(--border)',
                              }}
                            >
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                More replies
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {remainingReplies.map((reply) => (
                                  <div key={reply.id} style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                                    <div style={{ marginBottom: '0.15rem' }}>
                                      <span style={{ fontWeight: 500 }}>{formatName(reply.author)}</span>{' '}
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        • <time dateTime={reply.created_at}>{formatTime(reply.created_at)}</time>
                                      </span>
                                    </div>
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{reply.body}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <textarea
                              className="form-control"
                              rows={2}
                              placeholder="Write a reply…"
                              value={replyDrafts[thread.id] ?? ''}
                              onChange={(e) =>
                                setReplyDrafts((prev) => ({
                                  ...prev,
                                  [thread.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ alignSelf: 'flex-end', width: 'auto', padding: '0.35rem 1rem', fontSize: '0.85rem' }}
                              disabled={postingReplyId === thread.id || !(replyDrafts[thread.id] || '').trim()}
                              onClick={() => handlePostReply(thread.id)}
                            >
                              {postingReplyId === thread.id ? 'Posting…' : 'Reply'}
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </ChatProvider>
  )
}


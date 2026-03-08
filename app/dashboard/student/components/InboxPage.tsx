'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  deriveKey,
  encrypt,
  decrypt,
  isEncrypted,
  stripE2EPrefix,
  withE2EPrefix,
  SALT_LEN,
} from '@/lib/chatCrypto'
import type { Conversation, Message, SearchUser } from './chatShared'
import { MessageStatus } from './chatShared'

interface InboxPageProps {
  userId: string
  userRole: 'student' | 'professor'
  inboxHref: string
  backHref: string
  backLabel: string
  showTopBarLogo?: boolean
}

export default function InboxPage({ userId, userRole, inboxHref, backHref, backLabel, showTopBarLogo }: InboxPageProps) {
  const searchParams = useSearchParams()
  const startWithUserId = searchParams.get('userId')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNewChat, setShowNewChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageChannelRef = useRef<any>(null)

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, 30000)
    return () => clearInterval(interval)
  }, [userId])

  useEffect(() => {
    if (startWithUserId) {
      startConversation(startWithUserId).then(() => setMobileShowChat(true))
    }
  }, [startWithUserId])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation)
      markConversationAsRead(selectedConversation)
    }
  }, [selectedConversation])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!selectedConversation) return
    const channel = supabase
      .channel(`messages:${selectedConversation}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation}` }, () => {
        fetchMessages(selectedConversation)
        fetchConversations()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation}` }, () => fetchMessages(selectedConversation))
      .subscribe()
    messageChannelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [selectedConversation])

  async function fetchConversations() {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          participant1:user_profiles!conversations_participant1_id_fkey(id, first_name, last_name, email, role),
          participant2:user_profiles!conversations_participant2_id_fkey(id, first_name, last_name, email, role)
        `)
        .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
        .order('last_message_at', { ascending: false })
      if (error) throw error
      if (!data) return

      const formatted: Conversation[] = await Promise.all(
        data.map(async (conv: any) => {
          const otherUser = conv.participant1_id === userId ? conv.participant2 : conv.participant1

          const { data: lastMsgRaw } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, delivered_at, read_at, read')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          let lastMsg = lastMsgRaw as any | null
          if (lastMsg && conv.encryption_salt && isEncrypted(lastMsg.content)) {
            try {
              const key = await deriveKey(conv.id, conv.encryption_salt)
              const decrypted = await decrypt(stripE2EPrefix(lastMsg.content), key)
              lastMsg = { ...lastMsg, content: decrypted }
            } catch {
              lastMsg = { ...lastMsg, content: '[Unable to decrypt]' }
            }
          }

          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('read', false)
            .neq('sender_id', userId)

          return {
            id: conv.id,
            participant1_id: conv.participant1_id,
            participant2_id: conv.participant2_id,
            last_message_at: conv.last_message_at,
            encryption_salt: conv.encryption_salt,
            other_user: otherUser,
            last_message: lastMsg || null,
            unread_count: count || 0,
          }
        })
      )

      setConversations(formatted)
    } catch (e) {
      console.error('Error fetching conversations:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages(conversationId: string) {
    try {
      const conv = conversations.find((c) => c.id === conversationId)
      const salt = conv?.encryption_salt
      const { data, error } = await supabase.from('messages').select(`*, sender:user_profiles!messages_sender_id_fkey(first_name, last_name)`).eq('conversation_id', conversationId).order('created_at', { ascending: true })
      if (error) throw error
      if (!data) return
      let list = data as Message[]
      if (salt) {
        try {
          const key = await deriveKey(conversationId, salt)
          list = await Promise.all(list.map(async (m) => {
            if (!isEncrypted(m.content)) return m
            try {
              const decrypted = await decrypt(stripE2EPrefix(m.content), key)
              return { ...m, content: decrypted }
            } catch {
              return { ...m, content: '[Unable to decrypt]' }
            }
          }))
        } catch {
          /* keep as-is */
        }
      }
      setMessages(list)
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      await fetch('/api/chat/mark-delivered', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ conversationId }) })
    } catch (e) {
      console.error('Error fetching messages:', e)
    }
  }

  async function markConversationAsRead(conversationId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      await fetch('/api/chat/mark-read', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ conversationId }) })
      fetchConversations()
    } catch (e) {
      console.error('Error marking as read:', e)
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversation || sending) return
    const conv = conversations.find((c) => c.id === selectedConversation)
    const salt = conv?.encryption_salt
    let contentToSend = newMessage.trim()
    if (salt) {
      try {
        const key = await deriveKey(selectedConversation, salt)
        contentToSend = withE2EPrefix(await encrypt(contentToSend, key))
      } catch (e) {
        console.error('Encryption failed:', e)
        return
      }
    }
    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({ conversation_id: selectedConversation, sender_id: userId, content: contentToSend })
      if (error) throw error
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selectedConversation)
      setNewMessage('')
      fetchMessages(selectedConversation)
      fetchConversations()
    } catch (e) {
      console.error('Error sending message:', e)
    } finally {
      setSending(false)
    }
  }

  async function startConversation(otherUserId: string) {
    try {
      const { data: existing } = await supabase.from('conversations').select('id, encryption_salt').or(`and(participant1_id.eq.${userId},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${userId})`).maybeSingle()
      if (existing) {
        setSelectedConversation(existing.id)
        setShowNewChat(false)
        setSearchQuery('')
        setSearchResults([])
        setMobileShowChat(true)
        fetchConversations()
        return
      }
      const salt = btoa(String.fromCharCode.apply(null, Array.from(crypto.getRandomValues(new Uint8Array(SALT_LEN)))))
      const { data: created, error } = await supabase.from('conversations').insert({ participant1_id: userId, participant2_id: otherUserId, encryption_salt: salt }).select().single()
      if (error) throw error
      setSelectedConversation(created.id)
      setShowNewChat(false)
      setSearchQuery('')
      setSearchResults([])
      setMobileShowChat(true)
      fetchConversations()
    } catch (e) {
      console.error('Error starting conversation:', e)
    }
  }

  async function searchUsers() {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const q = `%${searchQuery.trim()}%`
    const { data, error } = await supabase.from('user_profiles').select('id, first_name, last_name, email, role').neq('id', userId).in('role', ['student', 'professor']).or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`).limit(20)
    setSearching(false)
    if (error) {
      setSearchResults([])
      return
    }
    setSearchResults(data || [])
  }

  useEffect(() => {
    const t = setTimeout(searchUsers, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function deleteConversation(conversationId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(conversationId)
    try {
      const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
      if (error) throw error
      if (selectedConversation === conversationId) {
        setSelectedConversation(null)
        setMessages([])
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))
    } catch (err) {
      console.error('Error deleting conversation:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const currentConversation = conversations.find((c) => c.id === selectedConversation)

  const filteredConversations = useMemo(() => {
    if (!conversationSearchQuery.trim()) return conversations
    const q = conversationSearchQuery.trim().toLowerCase()
    return conversations.filter((conv) => {
      const name = [conv.other_user?.first_name, conv.other_user?.last_name].filter(Boolean).join(' ').toLowerCase()
      const email = (conv.other_user?.email ?? '').toLowerCase()
      const lastMsg = (conv.last_message?.content ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || lastMsg.includes(q)
    })
  }, [conversations, conversationSearchQuery])

  const headerStyle = {
    padding: '12px 16px',
    background: 'var(--navy-dark)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  }
  const listItemStyle = {
    padding: '12px 44px 12px 16px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  }
  const bubbleOwn = { maxWidth: '75%', padding: '8px 12px 6px 12px', borderRadius: '18px 18px 4px 18px', background: 'var(--teal-bright)', color: 'white', marginLeft: 'auto' }
  const bubbleOther = { maxWidth: '75%', padding: '8px 12px 6px 12px', borderRadius: '18px 18px 18px 4px', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }

  const leftPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={headerStyle}>
        <span className="inbox-hide-on-desktop">
          <Link href={backHref} style={{ color: 'white', display: 'flex', padding: '4px' }} aria-label="Back">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
        </span>
        {showNewChat ? (
          <>
            <button type="button" onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]) }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', display: 'flex' }} aria-label="Close">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>New chat</span>
          </>
        ) : (
          <>
            <span className="inbox-hide-on-desktop" style={{ fontWeight: 600, fontSize: '1rem' }}>Chats</span>
            <button type="button" onClick={() => setShowNewChat(true)} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
              New chat
            </button>
          </>
        )}
        {showTopBarLogo && (
          <img src="/logo.png" alt="" style={{ height: 52, marginLeft: 'auto', objectFit: 'contain' }} />
        )}
      </div>
      {!showNewChat && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} aria-hidden>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="search"
              value={conversationSearchQuery}
              onChange={(e) => setConversationSearchQuery(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search conversations"
              style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)' }}
            />
          </div>
        </div>
      )}
      {showNewChat ? (
        <>
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name or email..." autoFocus style={{ width: '100%', padding: '10px 14px', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {searching ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Searching...</div> : searchResults.length === 0 && searchQuery.trim() ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No users found</div> : searchResults.map((u) => (
              <div key={u.id} onClick={() => startConversation(u.id)} style={listItemStyle} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || 'No name'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email} · {u.role}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ ...listItemStyle, background: 'var(--surface)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="skeleton skeleton-text sm" style={{ width: '70%', marginBottom: '0.35rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '90%' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span className="skeleton skeleton-badge" style={{ width: '24px' }} />
                    <span className="skeleton skeleton-text sm" style={{ width: '32px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {conversations.length === 0 ? (
                <><p>No conversations yet</p><p style={{ marginTop: '8px' }}>Tap &quot;New chat&quot; to search and start a conversation</p></>
              ) : (
                <><p>No chats match your search</p><p style={{ marginTop: '8px' }}>Try a different name, email, or message text</p></>
              )}
            </div>
          ) : filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => { setSelectedConversation(conv.id); setMobileShowChat(true) }}
              style={{ ...listItemStyle, position: 'relative', background: conv.unread_count > 0 ? 'rgba(8, 146, 165, 0.06)' : 'var(--surface)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = conv.unread_count > 0 ? 'rgba(8, 146, 165, 0.06)' : 'var(--surface)' }}
              className="inbox-conv-row"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: conv.unread_count > 0 ? 600 : 500, color: 'var(--text)', fontSize: '0.9rem' }}>{conv.other_user?.first_name} {conv.other_user?.last_name}</div>
                {conv.last_message && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{conv.last_message.sender_id === userId ? 'You: ' : ''}{conv.last_message.content}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                {conv.unread_count > 0 && <span style={{ background: 'var(--teal-bright)', color: 'white', borderRadius: '50%', minWidth: '20px', height: '20px', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              {/* Gradient overlay (left to right) with delete button - visibility via CSS :hover */}
              <div
                className="inbox-conv-delete-overlay"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to right, transparent 0%, transparent 40%, rgba(0,0,0,0.08) 70%, rgba(0,0,0,0.25) 100%)',
                  transition: 'opacity 0.2s ease',
                }}
              />
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={(e) => deleteConversation(conv.id, e)}
                disabled={deletingId === conv.id}
                className={`ai-helper-chat-delete inbox-conv-delete-btn ${deletingId === conv.id ? 'inbox-conv-delete-btn-visible' : ''}`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 12,
                  transform: 'translateY(-50%)',
                  cursor: deletingId === conv.id ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId === conv.id ? (
                  <span style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'inbox-spin 0.6s linear infinite' }} />
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const rightPanel = !selectedConversation ? (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-muted)', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
        <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select a conversation</p>
        <p style={{ fontSize: '0.9rem' }}>Choose from your existing chats or start a new one.</p>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, flex: 1 }}>
      <div style={{ ...headerStyle, background: 'var(--surface)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <button type="button" onClick={() => { setSelectedConversation(null); setMobileShowChat(false) }} className="inbox-mobile-back" style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{currentConversation?.other_user?.first_name} {currentConversation?.other_user?.last_name}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)' }}>
        {messages.map((m) => {
          const isOwn = m.sender_id === userId
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
              <div style={isOwn ? bubbleOwn : bubbleOther}>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>{m.content}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.85, marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <MessageStatus isOwn={isOwn} deliveredAt={m.delivered_at} readAt={m.read_at} />
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="Type a message..." style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '0.9rem', outline: 'none', background: 'var(--surface)' }} />
        <button type="button" onClick={sendMessage} disabled={!newMessage.trim() || sending} style={{ padding: '10px 18px', background: sending ? 'var(--text-muted)' : 'var(--teal-bright)', color: 'white', border: 'none', borderRadius: '20px', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>Send</button>
      </div>
    </div>
  )

  return (
    <div className="inbox-page" style={{ display: 'flex', height: '100%', minHeight: 'calc(100vh - 0px)', background: 'var(--surface)' }}>
      <style>{`
        .inbox-page .inbox-left { width: 360px; min-width: 280px; border-right: 1px solid var(--border); flex-shrink: 0; flex-direction: column; height: 100%; }
        .inbox-page .inbox-right { flex: 1; min-width: 0; flex-direction: column; height: 100%; }
        .inbox-page .inbox-conv-delete-overlay { opacity: 0; pointer-events: none; }
        .inbox-page .inbox-conv-delete-btn { opacity: 0; pointer-events: none; }
        .inbox-page .inbox-conv-row:hover .inbox-conv-delete-overlay { opacity: 1; }
        .inbox-page .inbox-conv-row:hover .inbox-conv-delete-btn { opacity: 1; pointer-events: auto; }
        .inbox-page .inbox-conv-delete-btn.inbox-conv-delete-btn-visible { opacity: 1; pointer-events: auto; }
        @keyframes inbox-spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .inbox-page .inbox-left { display: none !important; }
          .inbox-page .inbox-left.mobile-open { display: flex !important; width: 100%; }
          .inbox-page .inbox-right { display: none !important; }
          .inbox-page .inbox-right.mobile-open { display: flex !important; width: 100%; }
          .inbox-page .inbox-mobile-back { display: flex !important; }
        }
      `}</style>
      <div className={`inbox-left ${!selectedConversation || !mobileShowChat ? 'mobile-open' : ''}`} style={{ display: 'flex' }}>
        {leftPanel}
      </div>
      <div className={`inbox-right ${selectedConversation && mobileShowChat ? 'mobile-open' : ''}`} style={{ display: 'flex' }}>
        {rightPanel}
      </div>
    </div>
  )
}

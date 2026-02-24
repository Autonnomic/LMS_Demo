'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useChat } from './ChatContext'

interface Conversation {
  id: string
  participant1_id: string
  participant2_id: string
  last_message_at: string
  other_user: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    role: string
  }
  last_message: {
    content: string
    sender_id: string
    created_at: string
  } | null
  unread_count: number
}

interface Message {
  id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
  sender: {
    first_name: string | null
    last_name: string | null
  }
}

interface ChatProps {
  userId: string
  userRole: 'student' | 'professor'
  startWithUserId?: string | null
}

export default function Chat({ userId, userRole, startWithUserId: propStartWithUserId }: ChatProps) {
  const { startWithUserId: contextStartWithUserId, openChat: contextOpenChat, setOpenChat: setContextOpenChat, setStartWithUserId: setContextStartWithUserId } = useChat()
  const startWithUserId = propStartWithUserId || contextStartWithUserId
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationChannelRef = useRef<any>(null)
  const messageChannelRef = useRef<any>(null)

  useEffect(() => {
    if (isOpen) {
      fetchConversations()
    }
    return () => {
      if (conversationChannelRef.current) {
        supabase.removeChannel(conversationChannelRef.current)
      }
      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current)
      }
    }
  }, [isOpen, userId])

  useEffect(() => {
    if (contextOpenChat) {
      setIsOpen(true)
      setContextOpenChat(false)
    }
  }, [contextOpenChat, setContextOpenChat])

  useEffect(() => {
    if (startWithUserId && isOpen) {
      startConversation(startWithUserId).then(() => {
        setContextStartWithUserId(null)
      })
    }
  }, [startWithUserId, isOpen, setContextStartWithUserId])

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
    if (isOpen && selectedConversation) {
      // Subscribe to new messages in the selected conversation
      const channel = supabase
        .channel(`messages:${selectedConversation}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation}`
          },
          () => {
            fetchMessages(selectedConversation)
            fetchConversations()
          }
        )
        .subscribe()

      messageChannelRef.current = channel

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [selectedConversation, isOpen])

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

      if (data) {
        const formattedConversations: Conversation[] = await Promise.all(
          data.map(async (conv) => {
            const otherUser = conv.participant1_id === userId 
              ? conv.participant2 
              : conv.participant1

            // Get last message
            const { data: lastMsg } = await supabase
              .from('messages')
              .select('content, sender_id, created_at')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            // Get unread count
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
              other_user: otherUser,
              last_message: lastMsg || null,
              unread_count: count || 0
            }
          })
        )

        setConversations(formattedConversations)
        setUnreadTotal(formattedConversations.reduce((sum, c) => sum + c.unread_count, 0))
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages(conversationId: string) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(first_name, last_name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (data) {
        setMessages(data as Message[])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }

  async function markConversationAsRead(conversationId: string) {
    try {
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .eq('read', false)

      fetchConversations()
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversation || sending) return

    setSending(true)
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConversation,
          sender_id: userId,
          content: newMessage.trim()
        })

      if (error) throw error

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedConversation)

      setNewMessage('')
      fetchMessages(selectedConversation)
      fetchConversations()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function startConversation(otherUserId: string) {
    try {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant1_id.eq.${userId},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${userId})`)
        .single()

      if (existing) {
        setSelectedConversation(existing.id)
        return
      }

      // Create new conversation
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          participant1_id: userId,
          participant2_id: otherUserId
        })
        .select()
        .single()

      if (error) throw error

      setSelectedConversation(data.id)
      fetchConversations()
    } catch (error) {
      console.error('Error starting conversation:', error)
      alert('Failed to start conversation')
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const currentConversation = conversations.find(c => c.id === selectedConversation)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {unreadTotal > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white'
            }}
          >
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              right: 0,
              width: '500px',
              maxWidth: '90vw',
              height: '600px',
              maxHeight: '80vh',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {!selectedConversation ? (
              // Conversation list view
              <>
                <div style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                    Messages
                  </h3>
                </div>
                <div style={{
                  overflowY: 'auto',
                  flex: 1
                }}>
                  {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading...
                    </div>
                  ) : conversations.length > 0 ? (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv.id)}
                        style={{
                          padding: '1rem',
                          borderBottom: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          background: conv.unread_count > 0 ? '#f0f9ff' : 'white',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e0f2fe'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = conv.unread_count > 0 ? '#f0f9ff' : 'white'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontWeight: conv.unread_count > 0 ? 600 : 500,
                              color: 'var(--text)',
                              fontSize: '0.875rem',
                              marginBottom: '0.25rem'
                            }}>
                              {conv.other_user.first_name} {conv.other_user.last_name}
                              <span style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                fontWeight: 400
                              }}>
                                ({conv.other_user.role})
                              </span>
                            </div>
                            {conv.last_message && (
                              <div style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {conv.last_message.sender_id === userId ? 'You: ' : ''}
                                {conv.last_message.content}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                            {conv.unread_count > 0 && (
                              <span style={{
                                background: '#ef4444',
                                color: 'white',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {conv.unread_count > 9 ? '9+' : conv.unread_count}
                              </span>
                            )}
                            <div style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)'
                            }}>
                              {new Date(conv.last_message_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p>No conversations yet</p>
                      <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Start a conversation from a course or profile
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Message view
              <>
                <div style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      onClick={() => setSelectedConversation(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <div style={{
                        fontWeight: 600,
                        color: 'var(--text)',
                        fontSize: '0.875rem'
                      }}>
                        {currentConversation?.other_user.first_name} {currentConversation?.other_user.last_name}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                      }}>
                        {currentConversation?.other_user.role}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  {messages.map((message) => {
                    const isOwn = message.sender_id === userId
                    return (
                      <div
                        key={message.id}
                        style={{
                          display: 'flex',
                          justifyContent: isOwn ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div style={{
                          maxWidth: '70%',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          background: isOwn ? 'var(--teal-bright)' : '#f3f4f6',
                          color: isOwn ? 'white' : 'var(--text)'
                        }}>
                          {!isOwn && (
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              marginBottom: '0.25rem',
                              opacity: 0.8
                            }}>
                              {message.sender.first_name} {message.sender.last_name}
                            </div>
                          )}
                          <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                            {message.content}
                          </div>
                          <div style={{
                            fontSize: '0.7rem',
                            opacity: 0.7,
                            marginTop: '0.25rem',
                            textAlign: 'right'
                          }}>
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div style={{
                  padding: '1rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Type a message..."
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: sending ? '#9ca3af' : 'var(--teal-bright)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: sending ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      fontSize: '0.875rem'
                    }}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

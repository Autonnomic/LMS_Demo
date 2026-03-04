'use client'

import React from 'react'

export interface Conversation {
  id: string
  participant1_id: string
  participant2_id: string
  last_message_at: string
  encryption_salt?: string | null
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
    delivered_at?: string | null
    read_at?: string | null
    read?: boolean
  } | null
  unread_count: number
}

export interface Message {
  id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
  delivered_at?: string | null
  read_at?: string | null
  sender: {
    first_name: string | null
    last_name: string | null
  }
}

export interface SearchUser {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string
}

export function MessageStatus({
  isOwn,
  deliveredAt,
  readAt,
}: {
  isOwn: boolean
  deliveredAt?: string | null
  readAt?: string | null
}) {
  if (!isOwn) return null
  const read = !!readAt
  const delivered = !!deliveredAt
  return (
    <span style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center' }}>
      {read ? (
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{ color: 'var(--blue-accent)' }}>
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.266c.143.14.361.125.484-.033l6.272-8.052a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.366.366 0 0 0 .006.516l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.052a.365.365 0 0 0-.063-.51z" fill="currentColor"/>
        </svg>
      ) : delivered ? (
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{ color: 'var(--text-muted)' }}>
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.266c.143.14.361.125.484-.033l6.272-8.052a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.366.366 0 0 0 .006.516l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.052a.365.365 0 0 0-.063-.51z" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="16" height="14" viewBox="0 0 16 12" fill="none" style={{ color: 'var(--text-muted)' }}>
          <path d="M1.5 6.5L5 10L14.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  )
}

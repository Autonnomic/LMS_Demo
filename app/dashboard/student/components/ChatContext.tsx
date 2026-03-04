'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface ChatContextType {
  startWithUserId: string | null
  setStartWithUserId: (userId: string | null) => void
  openChat: boolean
  setOpenChat: (open: boolean) => void
  unreadTotal: number
  setUnreadTotal: (count: number) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [startWithUserId, setStartWithUserId] = useState<string | null>(null)
  const [openChat, setOpenChat] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)

  return (
    <ChatContext.Provider
      value={{ startWithUserId, setStartWithUserId, openChat, setOpenChat, unreadTotal, setUnreadTotal }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}

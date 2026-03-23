'use client'

import { createContext, useContext } from 'react'

export interface AiHelperUser {
  userId: string
  userName: string
  userInitials: string
  userRole: 'student' | 'professor'
}

export const AiHelperUserContext = createContext<AiHelperUser | null>(null)

export function useAiHelperUser() {
  return useContext(AiHelperUserContext)
}

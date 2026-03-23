'use client'

import { useAiHelperUser } from './AiHelperUserContext'
import AiHelperChat from '../student/components/AiHelperChat'

export default function AiHelperPage() {
  const user = useAiHelperUser()
  if (!user) return null
  return <AiHelperChat userId={user.userId} />
}

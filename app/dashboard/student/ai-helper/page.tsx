'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StudentAiHelperRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/ai-helper')
  }, [router])
  return null
}

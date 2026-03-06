'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProfessorAiHelperRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/ai-helper')
  }, [router])
  return null
}

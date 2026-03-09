'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboardPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/admin/professors')
  }, [router])
  return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <p>Redirecting...</p>
    </div>
  )
}

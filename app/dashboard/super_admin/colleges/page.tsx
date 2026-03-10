'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SuperAdminCollegesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/super-admin/colleges')
  }, [router])
  return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <p>Redirecting...</p>
    </div>
  )
}

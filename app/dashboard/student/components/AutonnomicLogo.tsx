'use client'

import Image from 'next/image'

export default function AutonnomicLogo() {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center',
      width: '100%',
      maxWidth: '200px'
    }}>
      <Image
        src="/logo.png"
        alt="Autonnomic Logo"
        width={180}
        height={60}
        style={{ 
          objectFit: 'contain',
          height: 'auto',
          width: '100%',
          maxWidth: '180px'
        }}
        priority
      />
    </div>
  )
}
import * as React from 'react'
import logoUrl from '@/assets/logo.png'

export function BrandLogo({
  size = 40,
  className = ''
}: {
  size?: number
  className?: string
}): React.ReactElement {
  return (
    <img
      src={logoUrl}
      alt="TubeProxies"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

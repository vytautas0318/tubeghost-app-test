// Growing ghost cluster per tier (solo → team → fleet), ported from the
// marketing pricing page. The ghost silhouette and its glasses are PNG masks
// tinted by `background`, so the same asset serves every colour.

import * as React from 'react'
import ghostMask from '@/assets/ghost-mask.png'
import glassesMask from '@/assets/ghost-glasses-mask.png'

const maskStyle = (url: string): React.CSSProperties => ({
  WebkitMaskImage: `url(${url})`,
  maskImage: `url(${url})`,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskSize: 'contain',
  maskSize: 'contain'
})

export function PlanGhosts({
  color,
  count = 1
}: {
  color: string
  count?: number
}): React.ReactElement {
  return (
    <div className="pg-ghosts" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="pg-ghost-logo"
          style={{ ...maskStyle(ghostMask), background: color }}
        >
          <span className="pg-ghost-glasses" style={maskStyle(glassesMask)} />
        </span>
      ))}
    </div>
  )
}

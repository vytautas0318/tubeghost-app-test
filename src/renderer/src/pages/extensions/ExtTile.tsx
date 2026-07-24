import * as React from 'react'
import { tileGradient, tileGlyph } from './extView'

// Icon tile: the manifest icon when present, else a deterministic colored
// letter tile. Shared by the installed card and browse card.
export function ExtTile({
  name,
  iconDataUrl,
  size = 44
}: {
  name: string
  iconDataUrl?: string | null
  size?: number
}): React.ReactElement {
  const radius = Math.round(size * 0.27)
  if (iconDataUrl) {
    return (
      <img
        src={iconDataUrl}
        alt=""
        width={size}
        height={size}
        style={{
          borderRadius: radius,
          flexShrink: 0,
          objectFit: 'cover',
          background: 'var(--hover)'
        }}
      />
    )
  }
  const grad = tileGradient(name)
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontSize: Math.round(size * 0.46),
        fontWeight: 700,
        background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`
      }}
    >
      {tileGlyph(name)}
    </span>
  )
}

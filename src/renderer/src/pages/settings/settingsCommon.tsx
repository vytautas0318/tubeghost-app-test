import * as React from 'react'

// Shared bits for the redesigned Settings panels (matches the DS SettingsView).
export function Srow({
  n,
  d,
  top,
  children
}: {
  n: React.ReactNode
  d: React.ReactNode
  top?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      className="srow"
      style={top ? { borderTop: '1px solid var(--line-2)', paddingTop: '14px' } : undefined}
    >
      <div className="srow-info">
        <div className="srow-n">{n}</div>
        <div className="srow-d">{d}</div>
      </div>
      {children}
    </div>
  )
}

// Shared style/type live beside the Srow component for import ergonomics; the
// mixed export is intentional (helpers used by every settings panel).
// eslint-disable-next-line react-refresh/only-export-components
export const redBtnStyle: React.CSSProperties = {
  borderColor: 'var(--red-soft-2)',
  color: 'var(--red)'
}

// Panels report outcomes via kind+text so success/error render distinctly.
export type Toast = (kind: 'success' | 'error' | 'info', msg: string) => void

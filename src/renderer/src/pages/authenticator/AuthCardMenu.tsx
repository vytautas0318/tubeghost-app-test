import * as React from 'react'
import { Copy, Lock, Users, Trash2 } from 'lucide-react'
import { NavIcon } from '@/components/sidebar/navIcons'

// The card ⋮ menu (§5), anchored at a fixed position. Each row is gated by the
// matching twofa.* permission. Reveal + Remove route through confirm dialogs in
// the parent (they don't act directly here).
export function AuthCardMenu({
  x,
  y,
  up,
  canCopy,
  canManage,
  canReveal,
  onCopy,
  onAssign,
  onReveal,
  onShare,
  onRemove
}: {
  x: number
  y: number
  up: boolean
  canCopy: boolean
  canManage: boolean
  canReveal: boolean
  onCopy: () => void
  onAssign: (e: React.MouseEvent) => void
  onReveal: () => void
  onShare: () => void
  onRemove: () => void
}): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        left: x + 'px',
        top: y + 'px',
        transform: up ? 'translateY(-100%)' : undefined,
        zIndex: 200
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row-menu" style={{ position: 'static', minWidth: '176px' }}>
        {canCopy && (
          <div className="rm-item" onClick={onCopy}>
            <Copy size={15} />
            Copy code
          </div>
        )}
        {canManage && (
          <div className="rm-item" onClick={onAssign}>
            <NavIcon name="profiles" size={15} />
            Assign to profile
          </div>
        )}
        {canReveal && (
          <div className="rm-item" onClick={onReveal}>
            <Lock size={15} />
            Show setup key
          </div>
        )}
        <div className="rm-item" onClick={onShare}>
          <Users size={15} />
          Share with team
        </div>
        {canManage && (
          <>
            <div className="rm-sep" />
            <div className="rm-item danger" onClick={onRemove}>
              <Trash2 size={15} />
              Remove
            </div>
          </>
        )}
      </div>
    </div>
  )
}

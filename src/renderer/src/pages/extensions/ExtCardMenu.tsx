import * as React from 'react'
import { Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { NavIcon } from '@/components/sidebar/navIcons'

// Fixed-position dropdown for a card's ⋮ menu. Follows the shared .row-menu
// pattern (see pages/proxies/ProxyRowMenu.tsx). Actions are gated by the
// caller's permission props — a disabled item shows a title tooltip.
export interface ExtMenuActions {
  onManage: () => void
  onOptions: () => void
  onRemove: () => void
  canEdit: boolean
  canDelete: boolean
}

export function ExtCardMenu({
  pos,
  actions,
  onClose
}: {
  pos: { x: number; y: number; up: boolean }
  actions: ExtMenuActions
  onClose: () => void
}): React.ReactElement {
  const item = (
    fn: () => void,
    disabled: boolean,
    reason: string,
    children: React.ReactNode,
    danger = false
  ): React.ReactElement => (
    <div
      className={'rm-item' + (danger ? ' danger' : '') + (disabled ? ' disabled' : '')}
      title={disabled ? reason : undefined}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      onClick={() => {
        if (disabled) return
        fn()
        onClose()
      }}
    >
      {children}
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x + 'px',
        top: pos.y + 'px',
        transform: pos.up ? 'translateY(-100%)' : undefined,
        zIndex: 200
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row-menu" style={{ position: 'static', minWidth: '184px' }}>
        {item(
          actions.onManage,
          !actions.canEdit,
          "You don't have permission",
          <>
            <NavIcon name="profiles" size={15} />
            Manage profiles
          </>
        )}
        {item(
          actions.onOptions,
          false,
          '',
          <>
            <SettingsIcon size={15} />
            Options
          </>
        )}
        <div className="rm-sep" />
        {item(
          actions.onRemove,
          !actions.canDelete,
          "You don't have permission",
          <>
            <Trash2 size={15} />
            Remove
          </>,
          true
        )}
      </div>
    </div>
  )
}

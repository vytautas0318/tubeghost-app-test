import * as React from 'react'
import { Lock, Plus } from 'lucide-react'
import { AuthCard } from './AuthCard'
import { Ring } from './Ring'
import { PERIOD } from './useAuthData'
import type { AuthTokenRow } from '@/lib/authenticator'

// Status bar (§3) + responsive card grid, ending with the dashed "Add an
// account" card. All cards share the one `remaining`/`low` tick so their codes
// and rings roll over together.
export function AuthGrid({
  tokens,
  codes,
  remaining,
  low,
  canCopy,
  canManage,
  copiedId,
  profileName,
  colorFor,
  onCopy,
  onMenu,
  onTag,
  onAssign,
  onAdd
}: {
  tokens: AuthTokenRow[]
  codes: Record<string, string>
  remaining: number
  low: boolean
  canCopy: boolean
  canManage: boolean
  copiedId: string | null
  profileName: (id: string | null) => string | null
  colorFor: (name: string) => string
  onCopy: (id: string, issuer: string) => void
  onMenu: (e: React.MouseEvent, id: string) => void
  onTag: (e: React.MouseEvent, id: string) => void
  onAssign: (e: React.MouseEvent, id: string) => void
  onAdd: () => void
}): React.ReactElement {
  return (
    <>
      <div className="auth-bar">
        <div className="auth-bar-l">
          <Lock size={14} />
          <span>Codes refresh every 30s · synced &amp; encrypted across this workspace</span>
        </div>
        <div className="auth-bar-r">
          <Ring remaining={remaining} low={low} period={PERIOD} />
          <span className={'auth-bar-sec' + (low ? ' low' : '')}>{remaining}s</span>
        </div>
      </div>

      <div className="auth-grid">
        {tokens.map((t) => (
          <AuthCard
            key={t.id}
            token={t}
            code={codes[t.id]}
            profileName={profileName(t.assigned_profile_id)}
            colorFor={colorFor}
            canCopy={canCopy}
            low={low}
            copied={copiedId === t.id}
            ring={<Ring remaining={remaining} low={low} period={PERIOD} />}
            onCopy={() => onCopy(t.id, t.issuer)}
            onMenu={(e) => onMenu(e, t.id)}
            onTag={(e) => onTag(e, t.id)}
            onAssign={(e) => onAssign(e, t.id)}
          />
        ))}

        {canManage && (
          <div className="auth-card auth-add" onClick={onAdd}>
            <div className="auth-add-ic">
              <Plus size={20} />
            </div>
            <div className="auth-add-t">Add an account</div>
            <div className="auth-add-d">Scan a QR code or paste a setup key</div>
          </div>
        )}
      </div>
    </>
  )
}

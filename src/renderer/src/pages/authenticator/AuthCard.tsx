import { Badge, PlatformIcon, AuthTokenRow } from '@tubeghost/ui'
import * as React from 'react'
import { MoreVertical, Copy, Check, ChevronDown } from 'lucide-react'
import { NavIcon } from '@/components/sidebar/navIcons'

// One 2FA account card: platform + handle, live code (click-to-copy), tags,
// and the assigned-profile chip + countdown ring. Code is computed server-
// side and passed in; '••••••' shown while the batch is loading.
export function AuthCard({
  token,
  code,
  profileName,
  colorFor,
  canCopy,
  low,
  copied,
  ring,
  onCopy,
  onMenu,
  onTag,
  onAssign
}: {
  token: AuthTokenRow
  code: string | undefined
  profileName: string | null
  colorFor: (name: string) => string
  canCopy: boolean
  low: boolean
  copied: boolean
  ring: React.ReactNode
  onCopy: () => void
  onMenu: (e: React.MouseEvent) => void
  onTag: (e: React.MouseEvent) => void
  onAssign: (e: React.MouseEvent) => void
}): React.ReactElement {
  const shown = code ?? '••••••'
  return (
    <div
      className="auth-card"
      onClick={canCopy ? onCopy : undefined}
      title={canCopy ? 'Click to copy' : undefined}
    >
      <div className="auth-card-top">
        <PlatformIcon platform={token.platform === 'other' ? 'yt' : token.platform} size={32} />
        <div className="auth-id">
          <div className="auth-issuer">{token.issuer}</div>
          <div className="auth-handle">{token.handle}</div>
        </div>
        <div className="auth-kebab" onClick={onMenu}>
          <MoreVertical size={16} />
        </div>
      </div>

      <div className="auth-code-row">
        <div className={'auth-code' + (low ? ' low' : '')}>
          {shown.slice(0, 3)}
          <span className="auth-gap"> </span>
          {shown.slice(3)}
        </div>
        {canCopy && (
          <span className={'auth-copy' + (copied ? ' done' : '')}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </span>
        )}
      </div>

      <div className="auth-tags" onClick={onTag} title="Edit tags">
        {token.tags && token.tags.length ? (
          token.tags.map((key) => (
            <Badge key={key} color={colorFor(key)}>
              {key}
            </Badge>
          ))
        ) : (
          <span className="auth-tag-add">+ tag</span>
        )}
      </div>

      <div className="auth-foot">
        <span
          className={'auth-profile auth-profile-edit' + (profileName ? '' : ' unassigned')}
          onClick={onAssign}
          title="Assign to a profile"
        >
          <NavIcon name="profiles" size={14} />
          <span className="auth-profile-txt">{profileName ?? 'Assign profile'}</span>
          <ChevronDown className="auth-profile-chev" size={12} />
        </span>
        {ring}
      </div>
    </div>
  )
}

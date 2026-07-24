import * as React from 'react'
import { NavIcon, type NavIconName } from '@/components/sidebar/navIcons'

// Values stay on one line so every row is the same height and its centered
// icon lines up (a wrapping value would push its icon visually low).
const LC_V_ONE_LINE: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}

// ONE row component, reused for all three credentials — the only per-row
// difference is the tone/icon/label/value/handler passed in, so the rows are
// guaranteed to share identical layout, height, padding, and divider treatment.
function CredRow({
  tone,
  iconName,
  label,
  value,
  mono,
  onManage
}: {
  tone: 'px' | 'au' | 'ph'
  iconName: NavIconName
  label: string
  value: string
  mono?: boolean
  onManage: () => void
}): React.ReactElement {
  return (
    <div className="lc-row">
      <span
        className={'lc-ic ' + tone}
        style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        <NavIcon name={iconName} size={16} />
      </span>
      <div className="lc-info">
        <div className="lc-k">{label}</div>
        <div className={'lc-v' + (mono ? ' mono' : '')} style={LC_V_ONE_LINE}>
          {value}
        </div>
      </div>
      <span className="lc-go" onClick={onManage}>
        Manage
      </span>
    </div>
  )
}

// General-tab "Linked credentials" panel (matches the DS): the proxy the
// profile actually routes through (real, from the profile row) plus Manage
// jumps to the 2FA / phone areas. When `embedded` (rendered inside the General
// card after Notes) it keeps its `.linked-cred` top divider; standalone it wraps
// in its own `.ecard` and neutralizes the divider.
export function LinkedCredentials({
  proxyHost,
  onManageProxy,
  onManageAuth,
  onManagePhone,
  embedded = false
}: {
  proxyHost: string | null
  onManageProxy: () => void
  onManageAuth: () => void
  onManagePhone: () => void
  embedded?: boolean
}): React.ReactElement {
  const inner = (
    <div
      className="linked-cred"
      style={embedded ? undefined : { marginTop: 0, paddingTop: 0, borderTop: 'none' }}
    >
      <div className="lc-title">Linked credentials</div>
      <div className="lc-sub">
        This profile pulls these on launch — route, verify, and receive codes automatically.
      </div>
      <CredRow
        tone="px"
        iconName="proxies"
        label="Proxy"
        value={proxyHost || 'No proxy assigned'}
        mono
        onManage={onManageProxy}
      />
      <CredRow
        tone="au"
        iconName="shield"
        label="Authenticator"
        value="Open Authenticator to link 2FA"
        onManage={onManageAuth}
      />
      <CredRow
        tone="ph"
        iconName="phone"
        label="Phone number"
        value="Open Phone numbers to link"
        onManage={onManagePhone}
      />
    </div>
  )
  return embedded ? inner : <div className="ecard">{inner}</div>
}

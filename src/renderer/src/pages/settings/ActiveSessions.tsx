import * as React from 'react'
import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui'
import {
  listSessions,
  revokeSession,
  revokeAllOtherSessions,
  type LoginSession
} from '@/lib/sessions'
import { redBtnStyle, type Toast } from './settingsCommon'

export function ActiveSessions({ onToast }: { onToast: Toast }): React.ReactElement {
  const user = useAuth((s) => s.user)
  const [sessions, setSessions] = useState<LoginSession[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!user) return
    listSessions(user.id)
      .then(setSessions)
      .catch(() => undefined)
  }, [user])

  useEffect(() => load(), [load])

  const revoke = async (s: LoginSession): Promise<void> => {
    setBusyId(s.id)
    const res = await revokeSession(s.id)
    setBusyId(null)
    if (res.ok) {
      onToast('success', 'Session revoked')
      load()
    } else {
      onToast('error', res.error ?? 'Revoke failed')
    }
  }

  const signOutEverywhere = async (): Promise<void> => {
    setBusyId('all')
    const res = await revokeAllOtherSessions()
    setBusyId(null)
    if (res.ok) {
      onToast('success', 'Signed out of all other devices')
      load()
    } else {
      onToast('error', res.error ?? 'Failed')
    }
  }

  const meta = (s: LoginSession): string => {
    const loc = s.location ?? (s.ip ? String(s.ip) : null)
    const seen = s.is_current ? null : `${formatDistanceToNow(new Date(s.last_seen))} ago`
    return [loc, seen].filter(Boolean).join(' · ') || 'Recently active'
  }

  const others = sessions.filter((s) => !s.is_current)

  return (
    <div className="sec">
      <div className="sec-t">Active sessions</div>
      <div className="sec-s">Devices currently signed in to your account.</div>
      {sessions.length === 0 && <div className="fhint">No active sessions recorded yet.</div>}
      {sessions.map((s) => (
        <div className="sess-row" key={s.id}>
          <div className="sess-l">
            <span className="sess-ic">
              <Monitor size={16} />
            </span>
            <div>
              <div className="sess-dev">
                {s.device ?? 'Device'} · {s.browser ?? 'Browser'}
                {s.is_current && <span className="sess-cur">THIS DEVICE</span>}
              </div>
              <div className="sess-meta">{meta(s)}</div>
            </div>
          </div>
          {!s.is_current && (
            <Button
              size="sm"
              style={redBtnStyle}
              disabled={busyId === s.id}
              onClick={() => revoke(s)}
            >
              {busyId === s.id ? '…' : 'Revoke'}
            </Button>
          )}
        </div>
      ))}
      {others.length > 0 && (
        <div className="foot-btns">
          <Button style={redBtnStyle} disabled={busyId === 'all'} onClick={signOutEverywhere}>
            {busyId === 'all' ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        </div>
      )}
    </div>
  )
}

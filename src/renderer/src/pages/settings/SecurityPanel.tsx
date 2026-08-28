import { Button, Toggle, Select, Badge, get2faStatus, type TwoFactorStatus, getNotificationPrefs, saveNotificationPrefs } from '@tubeghost/ui'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { useHasPermission } from '@/lib/permissions'
import { getWorkspaceSettings, updateWorkspaceGeneral } from '@/lib/settings'
import { Srow, type Toast } from './settingsCommon'
import { TwoFactorModal } from './TwoFactorModal'
import { ActiveSessions } from './ActiveSessions'
import { IpAllowlistSection } from './IpAllowlistSection'
import { ConfirmDialog } from './ConfirmDialog'

export function SecurityPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const wsId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const user = useAuth((s) => s.user)
  const canEdit = useHasPermission('workspace.edit_settings')

  const [twofa, setTwofa] = useState<TwoFactorStatus>({ enabled: false, factorId: null })
  const [require2fa, setRequire2fa] = useState(false)
  const [timeout, setTimeout] = useState(24)
  const [loginAlerts, setLoginAlerts] = useState(true)
  const [manage2fa, setManage2fa] = useState(false)
  const [confirmRequire, setConfirmRequire] = useState(false)

  const refresh2fa = React.useCallback(() => {
    get2faStatus()
      .then(setTwofa)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh2fa()
    if (wsId)
      getWorkspaceSettings(wsId)
        .then((s) => {
          setRequire2fa(s.require_2fa)
          setTimeout(s.session_timeout_hours)
        })
        .catch(() => undefined)
    if (user)
      getNotificationPrefs(user.id, user.email)
        .then((p) => setLoginAlerts(p.login_alerts))
        .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, user?.id, refresh2fa])

  const saveWs = async (
    patch: { require_2fa?: boolean; session_timeout_hours?: number },
    msg: string
  ): Promise<void> => {
    if (!wsId) return
    try {
      await updateWorkspaceGeneral(wsId, patch)
      onToast('success', msg)
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    }
  }

  const toggleLoginAlerts = async (v: boolean): Promise<void> => {
    if (!user) return
    setLoginAlerts(v)
    try {
      const prefs = await getNotificationPrefs(user.id, user.email)
      await saveNotificationPrefs(user.id, { ...prefs, login_alerts: v })
    } catch {
      setLoginAlerts(!v)
      onToast('error', 'Could not save login alerts')
    }
  }

  return (
    <>
      <div className="sec">
        <div className="sec-t">Authentication</div>
        <div className="sec-s">Protect your account and the workspace.</div>
        <Srow
          n="Two-factor authentication"
          d={twofa.enabled ? 'Authenticator app · enabled' : 'Not enabled'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Badge tone={twofa.enabled ? 'green' : 'neutral'}>{twofa.enabled ? 'On' : 'Off'}</Badge>
            <Button size="sm" onClick={() => setManage2fa(true)}>
              Manage
            </Button>
          </div>
        </Srow>
        <Srow n="Require 2FA for all members" d="Block access until every member enables 2FA.">
          <Toggle
            checked={require2fa}
            disabled={!canEdit}
            onChange={(v) => {
              if (v) setConfirmRequire(true)
              else {
                setRequire2fa(false)
                void saveWs({ require_2fa: false }, 'Requirement removed')
              }
            }}
          />
        </Srow>
        <Srow n="Session timeout" d="Sign out automatically after inactivity.">
          <Select
            value={String(timeout)}
            disabled={!canEdit}
            onChange={(e) => {
              const v = Number(e.target.value)
              setTimeout(v)
              void saveWs({ session_timeout_hours: v }, 'Session timeout saved')
            }}
            style={{ minWidth: '160px' }}
          >
            <option value="1">1 hour</option>
            <option value="8">8 hours</option>
            <option value="24">24 hours</option>
            <option value="0">Never</option>
          </Select>
        </Srow>
        <Srow n="Login alerts" d="Email me when a new device signs in.">
          <Toggle checked={loginAlerts} onChange={(v) => void toggleLoginAlerts(v)} />
        </Srow>
      </div>

      <IpAllowlistSection wsId={wsId} canEdit={canEdit} onToast={onToast} />

      <ActiveSessions onToast={onToast} />

      {manage2fa && (
        <TwoFactorModal
          enabled={twofa.enabled}
          factorId={twofa.factorId}
          onClose={() => setManage2fa(false)}
          onChanged={refresh2fa}
          onToast={onToast}
        />
      )}

      {confirmRequire && (
        <ConfirmDialog
          title="Require 2FA for all members?"
          body="Members without two-factor authentication will be blocked from the workspace until they enable it."
          confirmLabel="Require 2FA"
          onCancel={() => setConfirmRequire(false)}
          onConfirm={() => {
            setRequire2fa(true)
            setConfirmRequire(false)
            void saveWs({ require_2fa: true }, '2FA now required for all members')
          }}
        />
      )}
    </>
  )
}

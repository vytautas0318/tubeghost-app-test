import { Button, wipeWorkspaceCookies, leaveWorkspace, deleteWorkspace } from '@tubeghost/ui'
import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Srow, redBtnStyle, type Toast } from './settingsCommon'
import { ConfirmDialog } from './ConfirmDialog'

type Dialog = 'wipe' | 'leave' | 'delete' | null

export function DangerZone({
  wsId,
  wsName,
  canEdit,
  onToast
}: {
  wsId: string | null
  wsName: string
  canEdit: boolean
  onToast: Toast
}): React.ReactElement {
  const navigate = useNavigate()
  const reloadWorkspaces = useWorkspace((s) => s.load)
  const canDelete = useHasPermission('workspace.delete')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>, ok: string, after?: () => void): Promise<void> => {
    if (!wsId) return
    setBusy(true)
    try {
      await fn()
      onToast('success', ok)
      setDialog(null)
      after?.()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const afterLeaveOrDelete = (): void => {
    // Refresh memberships → the store picks a remaining workspace or shows the
    // no-workspace state. Send the user home either way.
    void reloadWorkspaces()
    navigate('/')
  }

  return (
    <>
      <div className="sec danger">
        <div className="sec-t">Danger zone</div>
        <div className="sec-s">Irreversible actions. Proceed with care.</div>

        <Srow n="Wipe all cookies & sessions" d="Clears stored login state from every profile.">
          <Button
            size="sm"
            style={redBtnStyle}
            disabled={!canEdit}
            title={!canEdit ? "You don't have permission" : undefined}
            onClick={() => setDialog('wipe')}
          >
            Wipe
          </Button>
        </Srow>

        <Srow n="Leave workspace" d={`Remove yourself from ${wsName}.`}>
          <Button size="sm" style={redBtnStyle} onClick={() => setDialog('leave')}>
            Leave
          </Button>
        </Srow>

        <Srow n="Delete workspace" d="Permanently remove all profiles, proxies, and members.">
          <Button
            variant="danger"
            size="sm"
            disabled={!canDelete}
            title={!canDelete ? 'Only the workspace owner can delete it' : undefined}
            onClick={() => setDialog('delete')}
          >
            Delete
          </Button>
        </Srow>
      </div>

      {dialog === 'wipe' && (
        <ConfirmDialog
          title="Wipe all cookies & sessions?"
          body={
            <>
              This clears stored login state from every profile in <b>{wsName}</b>. Each profile
              will start its next session signed out. This cannot be undone.
            </>
          }
          confirmLabel="Wipe"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => wipeWorkspaceCookies(wsId!), 'Cookies & sessions wiped')}
        />
      )}

      {dialog === 'leave' && (
        <ConfirmDialog
          title="Leave workspace?"
          body={
            <>
              You&apos;ll immediately lose access to <b>{wsName}</b> and everything in it. You can
              be re-invited later.
            </>
          }
          confirmLabel="Leave"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => leaveWorkspace(wsId!), `Left ${wsName}`, afterLeaveOrDelete)}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete workspace?"
          body={
            <>
              This permanently removes <b>{wsName}</b> — all profiles, proxies, extensions,
              authenticator secrets, and members. This <b>cannot be undone</b>.
            </>
          }
          confirmLabel="Delete workspace"
          confirmPhrase={wsName}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            run(() => deleteWorkspace(wsId!), 'Workspace deleted', afterLeaveOrDelete)
          }
        />
      )}
    </>
  )
}

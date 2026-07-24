import * as React from 'react'
import { ConfirmDialog, SetupKeyDialog } from './ConfirmDialog'

// The three modal overlays (§5/§9): reveal-confirm, the revealed setup key, and
// the destructive remove-confirm. Grouped so the page orchestrator stays lean.
export function AuthDialogs({
  confirmReveal,
  revealed,
  confirmRemove,
  onCancelReveal,
  onConfirmReveal,
  onCloseKey,
  onCopyKey,
  onCancelRemove,
  onConfirmRemove
}: {
  confirmReveal: string | null
  revealed: { issuer: string; secret: string } | null
  confirmRemove: string | null
  onCancelReveal: () => void
  onConfirmReveal: (id: string) => void
  onCloseKey: () => void
  onCopyKey: () => void
  onCancelRemove: () => void
  onConfirmRemove: (id: string) => void
}): React.ReactElement {
  return (
    <>
      {confirmReveal && (
        <ConfirmDialog
          title="Show setup key?"
          body="This reveals the raw TOTP secret. Anyone who sees it can generate this account’s codes."
          confirmLabel="Reveal key"
          onCancel={onCancelReveal}
          onConfirm={() => onConfirmReveal(confirmReveal)}
        />
      )}
      {revealed && (
        <SetupKeyDialog
          issuer={revealed.issuer}
          secret={revealed.secret}
          onClose={onCloseKey}
          onCopy={onCopyKey}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove token?"
          body="This deletes the 2FA account from the workspace. You’ll need the setup key to re-enroll it."
          confirmLabel="Remove"
          danger
          onCancel={onCancelRemove}
          onConfirm={() => onConfirmRemove(confirmRemove)}
        />
      )}
    </>
  )
}

import { Button, Input, enroll2fa, verify2faEnrollment, disable2fa, type EnrollResult } from '@tubeghost/ui'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { type Toast } from './settingsCommon'

// Manage the current user's TubeGhost login 2FA (Supabase native MFA / TOTP).
// If already enabled → offer disable. If not → enroll flow: show QR + secret,
// take a 6-digit code, verify.
export function TwoFactorModal({
  enabled,
  factorId,
  onClose,
  onChanged,
  onToast
}: {
  enabled: boolean
  factorId: string | null
  onClose: () => void
  onChanged: () => void
  onToast: Toast
}): React.ReactElement {
  const [enroll, setEnroll] = useState<EnrollResult | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // When turning 2FA ON, kick off enrollment immediately so the QR is ready.
  useEffect(() => {
    if (enabled) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true)
    enroll2fa()
      .then((r) => {
        if (cancelled) return
        if (r.error) setErr(r.error)
        else setEnroll(r.result ?? null)
      })
      .finally(() => !cancelled && setBusy(false))
    return () => {
      cancelled = true
    }
  }, [enabled])

  const verify = async (): Promise<void> => {
    if (!enroll) return
    setBusy(true)
    setErr(null)
    const res = await verify2faEnrollment(enroll.factorId, code)
    setBusy(false)
    if (res.ok) {
      onToast('success', 'Two-factor authentication enabled')
      onChanged()
      onClose()
    } else {
      setErr(res.error ?? 'Invalid code')
    }
  }

  const disable = async (): Promise<void> => {
    if (!factorId) return
    setBusy(true)
    const res = await disable2fa(factorId)
    setBusy(false)
    if (res.ok) {
      onToast('success', 'Two-factor authentication disabled')
      onChanged()
      onClose()
    } else {
      onToast('error', res.error ?? 'Failed to disable')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="max-w-sm w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--t1)] mb-1">
          {enabled ? 'Disable two-factor authentication' : 'Set up two-factor authentication'}
        </h3>

        {enabled ? (
          <>
            <p className="text-sm text-[var(--t2)] mb-4">
              Turning this off removes the second factor from your TubeGhost login. You can
              re-enable it any time.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={disable} disabled={busy}>
                {busy ? 'Working…' : 'Disable 2FA'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--t2)] mb-3">
              Scan this QR in your authenticator app, then enter the 6-digit code to confirm.
            </p>
            {enroll?.qrSvg && (
              <div className="flex justify-center mb-3">
                {/* Supabase returns an inline SVG data-URI for the QR. */}
                <img src={enroll.qrSvg} alt="2FA QR code" width={168} height={168} />
              </div>
            )}
            {enroll?.secret && (
              <div className="fhint" style={{ marginBottom: '12px', textAlign: 'center' }}>
                Or enter this key manually:{' '}
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                  {enroll.secret}
                </span>
              </div>
            )}
            <div className="field">
              <label className="flabel">Verification code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                style={{ fontFamily: 'var(--mono)', letterSpacing: '3px' }}
              />
            </div>
            {err && (
              <div className="fhint" style={{ color: 'var(--red)' }}>
                {err}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <Button size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={verify}
                disabled={busy || code.length !== 6 || !enroll}
              >
                {busy ? 'Verifying…' : 'Enable'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

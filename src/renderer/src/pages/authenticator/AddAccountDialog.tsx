import * as React from 'react'
import { useRef, useState } from 'react'
import { QrCode, KeyRound, Upload, X } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { PLATFORM_ISSUER } from './authData'
import { parseInput, platformForIssuer, decodeQr, type ParsedSecret } from './parse'
import { TagPicker } from './TagPicker'
import type { NewAuthTokenInput, AuthPlatform } from '@/lib/authenticator'
import type { TagRow } from '@/lib/tags'

interface ProfileOpt {
  id: string
  name: string
}

export function AddAccountDialog({
  workspaceId,
  profiles,
  workspaceTags,
  colorFor,
  canTagCreate,
  createTag,
  onClose,
  onSave
}: {
  workspaceId: string
  profiles: ProfileOpt[]
  workspaceTags: TagRow[]
  colorFor: (name: string) => string
  canTagCreate: boolean
  createTag: (name: string, color: string) => Promise<void>
  onClose: () => void
  onSave: (input: NewAuthTokenInput) => Promise<void>
}): React.ReactElement {
  const [method, setMethod] = useState<'qr' | 'key'>('key')
  const [raw, setRaw] = useState('') // setup key or otpauth URI
  const [issuer, setIssuer] = useState('')
  const [handle, setHandle] = useState('')
  const [label, setLabel] = useState('')
  const [assigned, setAssigned] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [parsed, setParsed] = useState<ParsedSecret | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Try to parse whatever the user has entered; surface validation inline.
  const tryParse = (): ParsedSecret | null => {
    try {
      const p = parseInput(raw, issuer, handle)
      setParsed(p)
      if (!issuer) setIssuer(p.issuer)
      if (!handle && p.handle) setHandle(p.handle)
      setErr(null)
      return p
    } catch (e) {
      setParsed(null)
      setErr((e as Error).message)
      return null
    }
  }

  const onFile = async (file: File): Promise<void> => {
    const uri = await decodeQr(file)
    if (!uri) {
      setErr('Couldn’t read a QR code from that image. Paste the setup key instead.')
      return
    }
    setRaw(uri)
    try {
      const p = parseInput(uri)
      setParsed(p)
      setIssuer(p.issuer)
      setHandle(p.handle)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const save = async (): Promise<void> => {
    const p = parsed ?? tryParse()
    if (!p) return
    setBusy(true)
    setErr(null)
    try {
      const iss = issuer.trim() || p.issuer
      const platform: AuthPlatform = platformForIssuer(iss)
      await onSave({
        workspace_id: workspaceId,
        platform,
        issuer: iss,
        handle: handle.trim() || null,
        label: label.trim() || null,
        secret: p.secret,
        algorithm: p.algorithm,
        digits: p.digits,
        period: p.period,
        tags,
        assigned_profile_id: assigned || null
      })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[var(--t1)]">Add account</h3>
          <button onClick={onClose} className="text-[var(--t3)] hover:text-[var(--t1)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <Button
            variant={method === 'key' ? 'primary' : 'secondary'}
            icon={<KeyRound size={15} />}
            onClick={() => setMethod('key')}
          >
            Paste setup key
          </Button>
          <Button
            variant={method === 'qr' ? 'primary' : 'secondary'}
            icon={<QrCode size={15} />}
            onClick={() => setMethod('qr')}
          >
            Scan a QR code
          </Button>
        </div>

        {method === 'qr' ? (
          <div className="mb-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 py-6 border border-dashed border-[var(--line)] rounded-[var(--r)] text-[var(--t2)] hover:bg-[var(--hover)]"
            >
              <Upload size={20} />
              <span className="text-sm">Upload a QR code image</span>
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--t2)] mb-1">
              Setup key or otpauth:// URI
            </label>
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onBlur={tryParse}
              placeholder="JBSWY3DPEHPK3PXP  ·  or  otpauth://totp/…"
              style={{ fontFamily: 'var(--mono)' }}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium text-[var(--t2)] mb-1">Issuer</label>
            <Input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder={PLATFORM_ISSUER.yt}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--t2)] mb-1">Handle</label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@account"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--t2)] mb-1">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Crime Dynasty — Main"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-[var(--t2)] mb-1">
            Assign to profile (optional)
          </label>
          <Select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--t2)] mb-1">Tags</label>
          <TagPicker
            workspaceTags={workspaceTags}
            colorFor={colorFor}
            canTagCreate={canTagCreate}
            createTag={createTag}
            selected={tags}
            onChange={setTags}
          />
        </div>

        {err && <div className="text-xs text-[var(--red)] mb-3">{err}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
          >
            Cancel
          </button>
          <Button variant="primary" disabled={busy || !raw.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Add account'}
          </Button>
        </div>
      </div>
    </div>
  )
}

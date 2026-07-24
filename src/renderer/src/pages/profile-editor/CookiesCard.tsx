// Cookie import card on the General tab. Import a JSON cookie array for the
// CURRENTLY-SELECTED profile — via file upload (Cookie-Editor / EditThisCookie
// export) or paste — and save it to that profile's cookies_json. The launch
// path (session-manager → parseCookiesJson → CdpPipe.setCookies) injects it
// on next launch. Uses the SAME shared parser the launch path uses, so the
// auth-cookie report below reflects exactly what will be injected.

import * as React from 'react'
import { useMemo, useRef, useState } from 'react'
import { Save, Upload } from 'lucide-react'
import { Section } from './parts'
import { useDirtyGuard, useRegisterSaver, type SaveResult } from './DirtyContext'
import { updateProfile, type ProfileRow } from '@/lib/profiles'
import { inspectCookiesJson, AUTH_COOKIE_NAMES } from '../../../../shared/cookies'

const MAX_RAW = 200_000 // 200 KB ceiling
// The three whose absence most likely breaks a signed-in Google session.
const CRITICAL = new Set(['SID', 'SAPISID', '__Secure-3PSID'])

export function CookiesCard({
  profile,
  onSaved
}: {
  profile: ProfileRow
  onSaved?: (p: ProfileRow) => void
}): React.ReactElement {
  const stored = profile.cookies_json ?? ''
  const [value, setValue] = useState<string>(stored)
  const [prevStored, setPrevStored] = useState<string>(stored)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset the editor when the STORED value changes (a different profile loaded,
  // or the row reloaded with new cookies). Render-time prop→state sync — the
  // React-recommended alternative to a setState-in-effect, and it won't clobber
  // unsaved edits when the row reloads for an unrelated field.
  if (stored !== prevStored) {
    setPrevStored(stored)
    setValue(stored)
  }

  const dirty = stored !== value
  useDirtyGuard('Cookies', dirty)

  // Shared inspector — identical rules to the launch-time parser.
  const insp = useMemo(() => inspectCookiesJson(value), [value])

  const setRaw = (s: string): void => {
    if (s.length > MAX_RAW) {
      setError(`Too large (>${MAX_RAW / 1000} KB)`)
      return
    }
    setError(null)
    setValue(s)
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!f) return
    try {
      setRaw(await f.text())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Pure persist — used by the per-card Save and the editor's top-right Save.
  const persist = async (): Promise<SaveResult & { row?: ProfileRow }> => {
    if (!dirty) return { ok: true }
    try {
      const r = await updateProfile(profile.id, { cookies_json: value.trim() ? value : null })
      return { ok: true, row: r }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  useRegisterSaver('Cookies', async () => {
    const r = await persist()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const r = await persist()
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (r.row) onSaved?.(r.row)
  }

  const placeholder = `[
  {"name":"SAPISID","value":"…","domain":".google.com","path":"/","secure":true,"httpOnly":true,"sameSite":"no_restriction"},
  {"name":"__Secure-3PSID","value":"…","domain":".google.com","secure":true,"httpOnly":true,"sameSite":"no_restriction"}
]`

  return (
    <Section
      title="Cookies"
      subtitle={
        <span className="text-[11px]">
          Optional. Imported cookies are injected into this profile on the next launch.
        </span>
      }
      action={
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1 text-[11px] font-medium text-[var(--t2)] border border-[var(--line)] rounded hover:bg-[var(--hover)] hover:text-[var(--red)] inline-flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            Import file
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="px-2.5 py-1 text-[11px] font-medium bg-[var(--red)] text-white rounded hover:bg-[var(--red-hover)] disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {error && <div className="mb-2 text-[11px] text-[var(--red)]">{error}</div>}
      <textarea
        rows={6}
        value={value}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full px-2.5 py-1.5 text-[11px] mono bg-[var(--panel-2)] border border-[var(--line)] rounded-md text-[var(--t1)] placeholder:text-[var(--t3)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 resize-y"
      />

      <div className="mt-1.5 flex justify-between items-center text-[10px]">
        <span className="text-[var(--t4)]">
          Cookie-Editor / EditThisCookie JSON export (must include HttpOnly cookies).
        </span>
        {value.trim() &&
          (insp.ok ? (
            <span className="text-[var(--green)] font-medium">
              {insp.total} parsed
              {insp.skipped.length > 0 && (
                <span className="text-[var(--amber)]">
                  {' '}
                  · {insp.skipped.length} skipped ({insp.skipped[0].reason})
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--red)] font-medium">{insp.error}</span>
          ))}
      </div>

      {value.trim() && insp.ok && insp.total > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1">
            Google auth cookies (HttpOnly)
          </div>
          <div className="flex flex-wrap gap-1">
            {AUTH_COOKIE_NAMES.map((n) => {
              const present = insp.authDetected[n]
              const critMissing = !present && CRITICAL.has(n)
              const cls = present
                ? 'bg-emerald-500/10 text-[var(--green)]'
                : critMissing
                  ? 'bg-red-500/10 text-[var(--red)]'
                  : 'bg-brand-dark/5 dark:bg-white/5 text-[var(--t4)]'
              return (
                <span key={n} className={`px-1.5 py-0.5 rounded text-[10px] mono ${cls}`} title={n}>
                  {present ? '✓' : '✕'} {n}
                </span>
              )
            })}
          </div>
          {CRITICAL.has('__Secure-3PSID') && !insp.authDetected['__Secure-3PSID'] && (
            <div className="mt-1 text-[10px] text-[var(--red)]">
              __Secure-3PSID missing — the signed-in session won&apos;t carry into third-party
              (reCAPTCHA) frames. Re-export with a tool that includes HttpOnly cookies.
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

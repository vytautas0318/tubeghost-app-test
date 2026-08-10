import * as React from 'react'
import { useEffect, useState } from 'react'
import { Fingerprint, Check } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Button, Toggle, Select } from '@/components/ui'
import {
  getWorkspaceSettings,
  updateFingerprintDefaults,
  RECOMMENDED_FINGERPRINT,
  type FingerprintDefaults,
  type WebrtcMode
} from '@/lib/settings'
import { Srow, type Toast } from './settingsCommon'

// Read-only cards: these are always randomized per profile (not a workspace
// default) — shown so the user understands the anti-detect posture.
const FP_CARDS: [string, string, string?][] = [
  ['WebGL / GPU', 'Randomized per profile'],
  ['Hardware', 'Randomized per profile'],
  ['Screen resolution', 'Randomized per profile'],
  ['Canvas noise', 'Per-profile seed', '· on']
]

export function FingerprintPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const wsId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const canEdit = useHasPermission('workspace.edit_settings')
  const [fp, setFp] = useState<FingerprintDefaults>(RECOMMENDED_FINGERPRINT)
  const [saved, setSaved] = useState<FingerprintDefaults>(RECOMMENDED_FINGERPRINT)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!wsId) return
    let cancelled = false
    getWorkspaceSettings(wsId)
      .then((s) => {
        if (cancelled) return
        setFp(s.fingerprint_defaults)
        setSaved(s.fingerprint_defaults)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [wsId])

  const dirty = JSON.stringify(fp) !== JSON.stringify(saved)
  const set = <K extends keyof FingerprintDefaults>(k: K, v: FingerprintDefaults[K]): void =>
    setFp((prev) => ({ ...prev, [k]: v }))

  const save = async (next: FingerprintDefaults, msg: string): Promise<void> => {
    if (!wsId) return
    setSaving(true)
    try {
      await updateFingerprintDefaults(wsId, next)
      setFp(next)
      setSaved(next)
      onToast('success', msg)
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const dis = !canEdit
  const title = dis ? "You don't have permission to edit workspace settings" : undefined

  return (
    <>
      <div className="sec">
        <div className="sec-t">Fingerprint defaults</div>
        <div className="sec-s">
          Baseline applied to new profiles. Identifying hardware is randomized per profile so no two
          devices look alike.
        </div>
        <div
          className="field"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}
        >
          <div>
            <label className="flabel">Operating system</label>
            <Select
              value={fp.os}
              onChange={(e) => set('os', e.target.value)}
              disabled={dis}
              title={title}
              style={{ minWidth: '100%' }}
            >
              <option value="win">Windows 11 · 64-bit</option>
              <option value="mac">macOS · Sonoma</option>
            </Select>
          </div>
          <div>
            <label className="flabel">Browser core</label>
            <Select
              value={fp.browser_core}
              onChange={(e) => set('browser_core', e.target.value)}
              disabled={dis}
              style={{ minWidth: '100%' }}
            >
              <option value="150">Chromium 150</option>
              <option value="148">Chromium 148</option>
            </Select>
          </div>
        </div>
        <div className="fpgrid">
          {FP_CARDS.map(([k, v, ok]) => (
            <div className="fp" key={k}>
              <div className="fp-k">
                <Fingerprint className="w-3.5 h-3.5" />
                {k}
              </div>
              <div className="fp-v">
                {v}
                {ok ? <span className="ok"> {ok}</span> : null}
              </div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="foot-btns">
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={!dirty || saving}
              onClick={() => save(fp, 'Fingerprint defaults saved')}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              disabled={saving}
              onClick={() => save(RECOMMENDED_FINGERPRINT, 'Reset to recommended')}
            >
              Reset to recommended
            </Button>
          </div>
        )}
      </div>

      <div className="sec">
        <div className="sec-t">Generation rules</div>
        <div className="sec-s">How fresh devices are built and kept consistent.</div>
        <Srow
          n="Auto-rotate fingerprints on launch"
          d="Generate a fresh, internally consistent device on each session."
        >
          <Toggle
            checked={fp.auto_rotate}
            onChange={(v) =>
              canEdit && save({ ...fp, auto_rotate: v }, 'Fingerprint defaults saved')
            }
            disabled={dis}
          />
        </Srow>
        <Srow n="Canvas / WebGL noise" d="Add a stable per-profile seed to canvas readbacks.">
          <Toggle
            checked={fp.canvas_noise}
            onChange={(v) =>
              canEdit && save({ ...fp, canvas_noise: v }, 'Fingerprint defaults saved')
            }
            disabled={dis}
          />
        </Srow>
        <Srow n="Default WebRTC mode" d="Applied to new profiles unless overridden.">
          <Select
            value={fp.webrtc_mode}
            onChange={(e) =>
              canEdit &&
              save(
                { ...fp, webrtc_mode: e.target.value as WebrtcMode },
                'Fingerprint defaults saved'
              )
            }
            disabled={dis}
            style={{ minWidth: '180px' }}
          >
            <option value="forward">Forward</option>
            <option value="replace">Replace</option>
            <option value="real">Real</option>
            <option value="disabled">Disabled</option>
          </Select>
        </Srow>
      </div>
    </>
  )
}

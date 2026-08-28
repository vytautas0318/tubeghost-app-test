import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Copy, RefreshCw, Sparkles } from 'lucide-react'
import { Button, Input } from '@tubeghost/ui'
import { useAuth } from '@/store/auth'
import {
  generatePairingCode,
  listCommandLog,
  listDevices,
  type BridgeDevice,
  type CommandLogEntry,
} from '@/lib/claude-bridge'
import { CommandLogTable, DeviceList } from './ClaudeDevices'
import { type Toast } from './settingsCommon'

// The connector URL. The dashboard is served from the SAME origin as the MCP
// endpoint, so window.location.origin is always correct — no env var needed.
// (An optional VITE_PUBLIC_BASE_URL override is honored only if it looks like a
// real URL, so a mis-set value like the literal var name can't leak through.)
const ENV_BASE = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined
const BASE = (ENV_BASE && /^https?:\/\//.test(ENV_BASE) ? ENV_BASE : window.location.origin).replace(/\/+$/, '')
const CONNECTOR_URL = `${BASE}/api/mcp`

export function ClaudePanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const user = useAuth((s) => s.user)
  const [devices, setDevices] = useState<BridgeDevice[]>([])
  const [log, setLog] = useState<CommandLogEntry[]>([])
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [d, l] = await Promise.all([listDevices(), listCommandLog(50)])
      setDevices(d)
      setLog(l)
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not load devices')
    }
  }, [onToast])

  // Load on mount / when the user changes. setState happens only inside the
  // awaited async body (via refresh), which is the allowed effect pattern.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [user, refresh])

  const genCode = async (): Promise<void> => {
    setBusy(true)
    try {
      setCode(await generatePairingCode())
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not generate a code')
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string, label: string): void => {
    void navigator.clipboard.writeText(text)
    onToast('success', `${label} copied`)
  }

  return (
    <>
      {/* ── Connect ─────────────────────────────────────────────── */}
      <div className="sec">
        <div className="sec-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> Connect Claude
        </div>
        <div className="sec-s">
          Add TubeGhost as a custom connector in Claude, then pair this account with your desktop app so Claude can
          manage your profiles. Custom connectors require a Claude plan that supports them (Pro, Team, or Enterprise).
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="flabel">Connector URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input readOnly value={CONNECTOR_URL} style={{ fontFamily: 'var(--mono)', flex: 1 }} />
            <Button size="sm" icon={<Copy size={14} />} onClick={() => copy(CONNECTOR_URL, 'URL')}>
              Copy
            </Button>
          </div>
          <div className="fhint">In Claude: Settings → Connectors → Add custom connector → paste this URL.</div>
        </div>
      </div>

      {/* ── Pairing code ────────────────────────────────────────── */}
      <div className="sec">
        <div className="sec-t">Pair a device</div>
        <div className="sec-s">
          Generate a code, then in TubeGhost desktop open Settings → Claude Bridge and enter it. Codes expire in 10
          minutes.
        </div>
        {code ? (
          <div
            style={{
              marginTop: 14,
              padding: '20px 24px',
              border: '1px solid var(--line-2)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 34,
                letterSpacing: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => copy(code.code, 'Code')}
              title="Click to copy"
            >
              {code.code}
            </div>
            <div className="sec-s" style={{ marginTop: 8 }}>
              Enter this in TubeGhost desktop. Expires{' '}
              {new Date(code.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </div>
            <div style={{ marginTop: 12 }}>
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void genCode()} disabled={busy}>
                New code
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <Button icon={<Sparkles size={15} />} onClick={() => void genCode()} disabled={busy}>
              {busy ? 'Generating…' : 'Generate pairing code'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Paired devices ──────────────────────────────────────── */}
      <div className="sec">
        <div className="sec-t">Paired devices</div>
        <div className="sec-s">
          Devices Claude can reach. Read tools are always allowed; “Allow writes” gates create/update/launch/delete
          actions (off by default keeps Claude read-only).
        </div>
        <DeviceList devices={devices} onChange={() => void refresh()} onToast={onToast} />
      </div>

      {/* ── Recent activity ─────────────────────────────────────── */}
      <div className="sec">
        <div className="sec-t">Recent activity</div>
        <div className="sec-s">The last 50 commands Claude ran through the bridge.</div>
        <CommandLogTable rows={log} />
      </div>
    </>
  )
}

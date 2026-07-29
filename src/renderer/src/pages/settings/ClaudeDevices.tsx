import * as React from 'react'
import { useState } from 'react'
import { Trash2, Check, X, Pencil } from 'lucide-react'
import { Toggle, Input } from '@/components/ui'
import { formatDistanceToNow } from 'date-fns'
import { type Toast } from './settingsCommon'
import { revokeDevice, updateDevice, type BridgeDevice, type CommandLogEntry } from '@/lib/claude-bridge'

// Small transparent icon button (no shared .icon-btn class exists in the DS kit).
function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 6,
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--t3)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const dot = (online: boolean): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: online ? 'var(--green)' : 'var(--t4)',
  flexShrink: 0,
})

// The paired-device list: online dot, inline rename, write-actions toggle, revoke.
export function DeviceList({
  devices,
  onChange,
  onToast,
}: {
  devices: BridgeDevice[]
  onChange: () => void
  onToast: Toast
}): React.ReactElement {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const saveName = async (d: BridgeDevice): Promise<void> => {
    const name = draft.trim()
    setEditing(null)
    if (!name || name === d.name) return
    try {
      await updateDevice(d.id, { name })
      onChange()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const toggleWrite = async (d: BridgeDevice): Promise<void> => {
    try {
      await updateDevice(d.id, { write_enabled: !d.write_enabled })
      onChange()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Update failed')
    }
  }

  const revoke = async (d: BridgeDevice): Promise<void> => {
    if (!window.confirm(`Revoke "${d.name}"? Claude will lose access and the device must be paired again.`)) return
    try {
      await revokeDevice(d.id)
      onToast('success', `Revoked "${d.name}"`)
      onChange()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Revoke failed')
    }
  }

  if (devices.length === 0) {
    return (
      <div className="sec-s" style={{ marginTop: 8 }}>
        No devices paired yet. Generate a code above and enter it in TubeGhost.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      {devices.map((d) => (
        <div key={d.id} className="srow" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <div className="srow-info" style={{ minWidth: 0 }}>
            <div className="srow-n" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={dot(d.online)} />
              {editing === d.id ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} style={{ height: 28, width: 180 }} />
                  <IconBtn title="Save" onClick={() => void saveName(d)}>
                    <Check size={14} />
                  </IconBtn>
                  <IconBtn title="Cancel" onClick={() => setEditing(null)}>
                    <X size={14} />
                  </IconBtn>
                </span>
              ) : (
                <>
                  {d.name}
                  <IconBtn
                    title="Rename"
                    onClick={() => {
                      setDraft(d.name)
                      setEditing(d.id)
                    }}
                  >
                    <Pencil size={12} />
                  </IconBtn>
                </>
              )}
            </div>
            <div className="srow-d">
              {d.platform ?? 'unknown'} · {d.app_version ?? '—'} ·{' '}
              {d.online
                ? 'online'
                : d.last_seen_at
                  ? `last seen ${formatDistanceToNow(new Date(d.last_seen_at))} ago`
                  : 'never seen'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              title="Allow write & action tools from Claude"
            >
              <span className="srow-d">Allow writes</span>
              <Toggle checked={d.write_enabled} onChange={() => void toggleWrite(d)} />
            </label>
            <IconBtn title="Revoke device" onClick={() => void revoke(d)}>
              <Trash2 size={15} />
            </IconBtn>
          </div>
        </div>
      ))}
    </div>
  )
}

// The last-N command audit rows.
export function CommandLogTable({ rows }: { rows: CommandLogEntry[] }): React.ReactElement {
  if (rows.length === 0) {
    return (
      <div className="sec-s" style={{ marginTop: 8 }}>
        No commands yet.
      </div>
    )
  }
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: 'var(--t4)', fontWeight: 500 }
  const td: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--line-2)' }
  return (
    <div style={{ marginTop: 8, overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>When</th>
            <th style={th}>Tool</th>
            <th style={th}>Status</th>
            <th style={th}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, color: 'var(--t3)' }}>{formatDistanceToNow(new Date(r.created_at))} ago</td>
              <td style={{ ...td, fontFamily: 'var(--mono)' }}>{r.tool}</td>
              <td style={{ ...td, color: r.status === 'failed' ? 'var(--red)' : 'var(--t2)' }}>
                {r.status}
                {r.error_code ? ` (${r.error_code})` : ''}
              </td>
              <td style={{ ...td, color: 'var(--t3)' }}>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

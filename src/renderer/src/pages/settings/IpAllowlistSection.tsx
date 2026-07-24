import * as React from 'react'
import { useEffect, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  listIpAllowlist,
  parseAllowlistText,
  replaceIpAllowlist,
  wouldCoverCurrentIp
} from '@/lib/ip-allowlist'
import { type Toast } from './settingsCommon'

// Best-effort current public IP for the self-lockout guard. Failure just
// disables the guard (the warning), never blocks saving.
async function fetchCurrentIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const j = (await res.json()) as { ip?: string }
    return j.ip ?? null
  } catch {
    return null
  }
}

export function IpAllowlistSection({
  wsId,
  canEdit,
  onToast
}: {
  wsId: string | null
  canEdit: boolean
  onToast: Toast
}): React.ReactElement {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState('')
  const [currentIp, setCurrentIp] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!wsId) return
    listIpAllowlist(wsId)
      .then((rows) => {
        const t = rows.map((r) => r.cidr).join('\n')
        setText(t)
        setLoaded(t)
      })
      .catch(() => undefined)
    void fetchCurrentIp().then(setCurrentIp)
  }, [wsId])

  const dirty = text !== loaded

  const save = async (): Promise<void> => {
    if (!wsId) return
    const { cidrs, errors } = parseAllowlistText(text)
    if (errors.length) {
      onToast('error', errors[0])
      return
    }
    // Self-lockout guard: if the list is non-empty and doesn't cover us, warn.
    if (cidrs.length > 0 && currentIp) {
      const covered = await wouldCoverCurrentIp(cidrs, currentIp)
      if (!covered) {
        onToast(
          'error',
          `Your current IP (${currentIp}) isn't in the list — add it or you'll lose access.`
        )
        return
      }
    }
    setSaving(true)
    try {
      await replaceIpAllowlist(wsId, cidrs)
      setLoaded(cidrs.join('\n'))
      setText(cidrs.join('\n'))
      onToast(
        'success',
        cidrs.length ? 'IP allowlist saved' : 'IP allowlist cleared (all IPs allowed)'
      )
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sec">
      <div className="sec-t">IP allowlist</div>
      <div className="sec-s">
        Only allow workspace access from these addresses. Leave empty to allow all.
      </div>
      <textarea
        className="inp"
        disabled={!canEdit}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{
          height: '74px',
          padding: '10px 13px',
          resize: 'none',
          fontFamily: 'var(--mono)',
          fontSize: '12.5px',
          lineHeight: 1.6,
          width: '100%'
        }}
        placeholder={'203.0.113.4\n198.51.100.0/24'}
      />
      {currentIp && (
        <div className="fhint" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={12} /> Your current IP is {currentIp}. Include it to avoid locking
          yourself out.
        </div>
      )}
      {canEdit && (
        <div className="foot-btns">
          <Button
            variant="primary"
            icon={<Check size={15} />}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save allowlist'}
          </Button>
        </div>
      )}
    </div>
  )
}

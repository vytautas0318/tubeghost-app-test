import * as React from 'react'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Toggle, Select } from '@tubeghost/ui'
import {
  getWorkspaceSettings,
  updateNetworkDefaults,
  RECOMMENDED_NETWORK,
  type NetworkDefaults,
  type ProxySource
} from '@/lib/settings'
import { Srow, type Toast } from './settingsCommon'

export function NetworkPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const wsId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const canEdit = useHasPermission('workspace.edit_settings')
  const [net, setNet] = useState<NetworkDefaults>(RECOMMENDED_NETWORK)

  useEffect(() => {
    if (!wsId) return
    let cancelled = false
    getWorkspaceSettings(wsId)
      .then((s) => !cancelled && setNet(s.network_defaults))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [wsId])

  // Network defaults are simple toggles/selects → save immediately on change.
  const save = async (next: NetworkDefaults): Promise<void> => {
    if (!wsId || !canEdit) return
    const prev = net
    setNet(next) // optimistic
    try {
      await updateNetworkDefaults(wsId, next)
      onToast('success', 'Network defaults saved')
    } catch (e) {
      setNet(prev) // revert
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    }
  }

  const dis = !canEdit
  const title = dis ? "You don't have permission to edit workspace settings" : undefined

  return (
    <>
      <div className="sec">
        <div className="sec-t">Proxy &amp; connection</div>
        <div className="sec-s">Defaults for how profiles route their traffic.</div>
        <Srow n="Default proxy source" d="Where new profiles pull a proxy from.">
          <Select
            value={net.proxy_source}
            onChange={(e) => save({ ...net, proxy_source: e.target.value as ProxySource })}
            disabled={dis}
            title={title}
            style={{ minWidth: '200px' }}
          >
            <option value="pool">TubeProxies pool</option>
            <option value="custom">Custom inline</option>
            <option value="none">No proxy</option>
          </Select>
        </Srow>
        <Srow n="Rotate proxy on each launch" d="Pull a fresh IP from the pool every session.">
          <Toggle
            checked={net.rotate_on_launch}
            onChange={(v) => save({ ...net, rotate_on_launch: v })}
            disabled={dis}
          />
        </Srow>
        <Srow n="Kill switch" d="Block all traffic if the proxy drops mid-session.">
          <Toggle
            checked={net.kill_switch}
            onChange={(v) => save({ ...net, kill_switch: v })}
            disabled={dis}
          />
        </Srow>
      </div>

      <div className="sec">
        <div className="sec-t">Reliability</div>
        <div className="sec-s">Timeouts and retry behavior when a proxy is slow.</div>
        <Srow n="Connection timeout" d="How long to wait before a proxy is marked unreachable.">
          <Select
            value={String(net.timeout_seconds)}
            onChange={(e) => save({ ...net, timeout_seconds: Number(e.target.value) })}
            disabled={dis}
            style={{ minWidth: '150px' }}
          >
            <option value="15">15 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">60 seconds</option>
          </Select>
        </Srow>
        <Srow n="Max retries" d="Attempts before surfacing a connection error.">
          <Select
            value={String(net.max_retries)}
            onChange={(e) => save({ ...net, max_retries: Number(e.target.value) })}
            disabled={dis}
            style={{ minWidth: '150px' }}
          >
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
          </Select>
        </Srow>
      </div>
    </>
  )
}

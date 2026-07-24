// Encapsulates the "Test connection" flow used by the detail drawer.
// Calls the proxy-test Edge Function, then persists the result back to
// the row (best-effort UPDATE — failures don't block the toast).

import { testProxy } from '@/lib/proxy-test'
import { updateProxy, type ProxyRow } from '@/lib/proxies'

export interface ProxyTestRunner {
  run: (
    selected: ProxyRow,
    setSelected: (row: ProxyRow) => void,
    showToast: (kind: 'error' | 'info', text: string) => void
  ) => Promise<void>
}

export function useProxyTest(): ProxyTestRunner {
  return {
    run: async (selected, setSelected, showToast) => {
      if (selected.proxy_type === 'wireguard') {
        showToast(
          'info',
          'WireGuard proxies skip the HTTP precheck — start a profile to verify.'
        )
        return
      }
      showToast('info', 'Testing connection…')
      try {
        const r = await testProxy({
          proxy_type: selected.proxy_type,
          host: selected.host,
          port: selected.port,
          username: selected.username,
          password: selected.password_encrypted ?? null,
          expected_egress_ip: selected.last_known_egress_ip
        })
        if (r.ok) {
          showToast(
            'info',
            `OK · egress ${r.egress_ip} · ${r.elapsed_ms}ms`
          )
          try {
            const updated = await updateProxy(selected.id, {
              last_known_egress_ip: r.egress_ip,
              last_test_ok: true,
              last_tested_at: new Date().toISOString()
            })
            setSelected(updated)
          } catch {
            /* best-effort */
          }
        } else {
          showToast('error', `${r.stage}: ${r.error}`)
          try {
            const updated = await updateProxy(selected.id, {
              last_test_ok: false,
              last_tested_at: new Date().toISOString()
            })
            setSelected(updated)
          } catch {
            /* best-effort */
          }
        }
      } catch (e) {
        showToast('error', (e as Error).message)
      }
    }
  }
}

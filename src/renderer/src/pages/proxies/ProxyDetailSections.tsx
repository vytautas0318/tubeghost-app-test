// Read-only display sections of the proxy detail drawer: connection summary,
// geo, and operational stats. Split out of ProxyDetailDrawer.tsx to keep it
// under the 250-line rule; these render facts and own no edit state.

import * as React from 'react'
import { ChevronRight, Copy, Eye, EyeOff } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ProxyRow } from '@/lib/proxies'
import { Flag } from '@/components/Flag'
import { DrawerSection, KV, KVCopy } from './drawer-parts'

export function Connection({
  proxy,
  showPassword,
  setShowPassword,
  copy
}: {
  proxy: ProxyRow
  showPassword: boolean
  setShowPassword: (v: boolean | ((v: boolean) => boolean)) => void
  copy: (v: string) => void
}): React.ReactElement {
  return (
    <DrawerSection title="Connection">
      <div className="space-y-2.5 text-xs">
        <KV k="Type" v={proxy.proxy_type.toUpperCase()} mono />
        <KVCopy k="Host" v={`${proxy.host}:${proxy.port}`} onCopy={copy} />
        {proxy.username && <KVCopy k="Username" v={proxy.username} onCopy={copy} />}
        {proxy.password_encrypted && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--t3)]">Password</span>
            <div className="flex items-center gap-1.5">
              <span className="mono text-[var(--t1)]">
                {showPassword ? proxy.password_encrypted : '••••••••'}
              </span>
              <button
                onClick={() => setShowPassword((v) => !v)}
                className="p-0.5 text-[var(--t4)] hover:text-[var(--t1)] dark:hover:text-night-text"
              >
                {showPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => copy(proxy.password_encrypted ?? '')}
                className="p-0.5 text-[var(--t4)] hover:text-[var(--t1)] dark:hover:text-night-text"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      {proxy.status === 'expired' ? (
        // The username/password rows above render nothing here: the server
        // withholds both once a proxy expires (migration 20260804d). Say so,
        // otherwise the Connection section just looks broken.
        <div className="mt-3 text-[11px] text-[var(--amber)] bg-[var(--panel-2)] border border-[var(--line)] rounded p-2">
          This proxy has expired, so its username and password are no longer available. Renew it on
          tubeproxies.com to restore access — the proxy is kept, not deleted.
        </div>
      ) : (
        proxy.source === 'tubeproxies' && (
          <div className="mt-3 text-[11px] text-[var(--t3)] bg-[var(--panel-2)] border border-[var(--line)] rounded p-2">
            Credentials are read live from your TubeProxies account and cannot be edited here.
          </div>
        )
      )}
    </DrawerSection>
  )
}

export function Geo({ proxy }: { proxy: ProxyRow }): React.ReactElement {
  return (
    <DrawerSection title="Geo">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <KV
          k="Country"
          title={proxy.country_name ?? proxy.country_code ?? undefined}
          v={
            proxy.country_code ? (
              <>
                <Flag code={proxy.country_code} />
                {proxy.country_name ?? proxy.country_code}
              </>
            ) : (
              '—'
            )
          }
        />
        <KV k="City" v={proxy.city ?? '—'} />
        <KV k="Region" v={proxy.region ?? '—'} />
        <KV k="Timezone" v={proxy.timezone ?? '—'} mono />
      </div>
    </DrawerSection>
  )
}

export function Operational({
  proxy,
  profileCount,
  profileNumbers,
  canTest,
  onTest
}: {
  proxy: ProxyRow
  profileCount: number
  profileNumbers: number[]
  canTest: boolean
  onTest: () => void
}): React.ReactElement {
  // The drawer is 480px wide, so the full list fits — no "+N" truncation here
  // (unlike the table column, which has ~70px).
  const using =
    profileCount === 0
      ? 'none'
      : `${profileCount} (${profileNumbers.map((n) => `#${n}`).join(', ')})`

  return (
    <DrawerSection title="Operational">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <KV k="Profiles using" v={using} />
        <KV k="Last egress IP" v={proxy.last_known_egress_ip ?? '—'} mono />
        <KV
          k="Last tested"
          v={
            proxy.last_tested_at
              ? formatDistanceToNow(new Date(proxy.last_tested_at), { addSuffix: true })
              : 'never'
          }
        />
        <KV
          k="Last test ok"
          v={proxy.last_test_ok === null ? '—' : proxy.last_test_ok ? 'yes' : 'no'}
        />
        {proxy.expires_at && (
          <KV
            k="Expires"
            v={formatDistanceToNow(new Date(proxy.expires_at), { addSuffix: true })}
          />
        )}
        {proxy.source === 'tubeproxies' && <KV k="Source" v="Live from TubeProxies" />}
      </div>
      {canTest && (
        <button
          onClick={onTest}
          className="mt-3 px-3 py-1.5 text-xs font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised flex items-center gap-1.5"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          Test connection
        </button>
      )}
    </DrawerSection>
  )
}

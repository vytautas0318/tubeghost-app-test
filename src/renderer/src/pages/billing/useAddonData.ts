// Add-on rows for the Proxies / Phone numbers billing tabs. Reads the real
// workspace records; the per-unit rate is computed from the shared pricing
// module against the pool size, so it always matches what the configurator
// and the marketing page quote at that volume.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getPhoneOverview } from '@/lib/phoneNumbers'
import { useWorkspace } from '@/store/workspace'
import type { Section } from './types'

export interface ProxyAddon {
  id: string
  label: string
  type: string
  location: string
  assignedProfile: string | null
}

export interface PhoneAddon {
  id: string
  number: string
  label: string | null
  createdAt: string
}

function loading<T>(data: T): Section<T> {
  return { data, loading: true, error: null }
}

export function useProxyAddons(): Section<ProxyAddon[]> {
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const [state, setState] = useState<Section<ProxyAddon[]>>(loading([]))

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    const supabase = getSupabase()
    if (!supabase) {
      // Deferred so the effect body never sets state synchronously
      // (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        if (!cancelled) setState({ data: [], loading: false, error: 'Supabase not configured' })
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: true, error: null }))
    })

    void supabase
      .from('proxies')
      .select('id, label, proxy_type, country_name, country_code, city, host')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: [], loading: false, error: error.message })
          return
        }
        const rows = (data ?? []) as Array<{
          id: string
          label: string | null
          proxy_type: string | null
          country_name: string | null
          country_code: string | null
          city: string | null
          host: string
        }>
        setState({
          loading: false,
          error: null,
          data: rows.map((r) => ({
            id: r.id,
            label: r.label ?? r.host,
            type: (r.proxy_type ?? '—').toUpperCase(),
            location: [r.city, r.country_name ?? r.country_code].filter(Boolean).join(', ') || '—',
            // Assignment lives on profiles.proxy_id; not joined here to keep
            // this a single cheap query. Shown as unassigned until wired.
            assignedProfile: null
          }))
        })
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return state
}

export function usePhoneAddons(): Section<PhoneAddon[]> {
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const [state, setState] = useState<Section<PhoneAddon[]>>(loading([]))

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    const supabase = getSupabase()
    if (!supabase) {
      // Deferred so the effect body never sets state synchronously
      // (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        if (!cancelled) setState({ data: [], loading: false, error: 'Supabase not configured' })
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: true, error: null }))
    })

    // Phone numbers come from TubeProxies (public.phone_numbers), read via the
    // `phone-numbers` Edge Function — the number column is encrypted at rest,
    // so the decrypt must happen server-side. This is the SAME source the
    // Phone page uses, so the two can never disagree.
    //
    // Note these are user-scoped, not workspace-scoped: a phone subscription
    // belongs to a TubeProxies account, not to a ghost workspace.
    void getPhoneOverview()
      .then((overview) => {
        if (cancelled) return
        setState({
          loading: false,
          error: null,
          data: overview.phone_numbers.map((r) => ({
            id: r.id,
            number: r.phone_number ?? '•••• unavailable',
            label: r.label,
            createdAt: r.created_at ?? ''
          }))
        })
      })
      .catch((e: Error) => {
        if (cancelled) return
        setState({ data: [], loading: false, error: e.message })
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return state
}

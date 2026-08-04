// Owns Authenticator-page data: initial load, realtime subscription,
// mutations, the single shared 30s tick, and batch code generation.
//
// One interval drives every card + both rings (never one-per-card). Codes
// are computed server-side (the seed key lives only in the Edge Function),
// so we refetch the whole batch once per period boundary — not every second
// — keyed by the TOTP step. Between boundaries the same codes are reused;
// only the countdown ring animates.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAuthToken,
  deleteAuthToken,
  generateCodes,
  listAuthTokens,
  updateAuthToken,
  type AuthTokenRow,
  type NewAuthTokenInput
} from '@/lib/authenticator'
import { getSupabase } from '@/lib/supabase'

export const PERIOD = 30

export interface UseAuthDataResult {
  tokens: AuthTokenRow[]
  codes: Record<string, string>
  now: number
  step: number
  remaining: number
  low: boolean
  loading: boolean
  error: string | null
  add: (input: NewAuthTokenInput) => Promise<AuthTokenRow>
  remove: (id: string) => Promise<void>
  patch: (
    id: string,
    p: Partial<Pick<AuthTokenRow, 'tags' | 'assigned_profile_id' | 'label'>>
  ) => Promise<void>
}

export function useAuthData(workspaceId: string | null, canView: boolean): UseAuthDataResult {
  const [tokens, setTokens] = useState<AuthTokenRow[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    if (!workspaceId || !canView) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    listAuthTokens(workspaceId)
      .then((data) => {
        if (cancelled) return
        setTokens(data)
        setError(null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspaceId, canView])

  // Realtime subscription — mirrors useProxiesData.
  useEffect(() => {
    if (!workspaceId || !canView) return
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel(`authenticator:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ghost',
          table: 'authenticator_tokens',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          setTokens((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as AuthTokenRow
              // Deduped: a local add + refetch can beat this event to the row.
              if (prev.some((t) => t.id === next.id)) return prev
              return [...prev, next]
            }
            if (payload.eventType === 'DELETE')
              return prev.filter((t) => t.id !== (payload.old as AuthTokenRow).id)
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as AuthTokenRow
              return prev.map((t) => (t.id === next.id ? next : t))
            }
            return prev
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, canView])

  // Single shared 1s tick.
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])

  const step = Math.floor(now / PERIOD)
  const remaining = PERIOD - (now % PERIOD)
  const low = remaining <= 5

  // Refetch the code batch once per step (period boundary) or when the token
  // set changes. `lastKey` guards against refetching every second.
  const lastKey = useRef<string>('')
  useEffect(() => {
    if (!canView) return
    const ids = tokens.map((t) => t.id)
    const key = `${step}|${ids.join(',')}`
    if (key === lastKey.current || ids.length === 0) return
    lastKey.current = key
    let cancelled = false
    generateCodes(ids, step * PERIOD)
      .then((c) => !cancelled && setCodes(c))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [step, tokens, canView])

  // Codes for tokens that no longer exist are simply never read (their card is
  // gone), so we derive only the codes for live tokens rather than clearing
  // state inside the fetch effect.
  const liveCodes = useMemo(() => {
    const ids = new Set(tokens.map((t) => t.id))
    const out: Record<string, string> = {}
    for (const id of Object.keys(codes)) if (ids.has(id)) out[id] = codes[id]
    return out
  }, [codes, tokens])

  const add = useMemo(
    () =>
      async (input: NewAuthTokenInput): Promise<AuthTokenRow> => {
        const row = await createAuthToken(input)
        setTokens((prev) => (prev.some((t) => t.id === row.id) ? prev : [...prev, row]))
        return row
      },
    []
  )
  const remove = useMemo(
    () =>
      async (id: string): Promise<void> => {
        await deleteAuthToken(id)
        setTokens((prev) => prev.filter((t) => t.id !== id))
      },
    []
  )
  const patch = useMemo(
    () =>
      async (
        id: string,
        p: Partial<Pick<AuthTokenRow, 'tags' | 'assigned_profile_id' | 'label'>>
      ): Promise<void> => {
        setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)))
        await updateAuthToken(id, p)
      },
    []
  )

  return { tokens, codes: liveCodes, now, step, remaining, low, loading, error, add, remove, patch }
}

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Cycle, GhostPlanKey } from '@shared/pricing'

export interface Issue {
  item: 'plan' | 'proxies' | 'numbers'
  message: string
  /** Blocking issues disable Buy; non-blocking ones are shown as notices. */
  blocking: boolean
}

export interface OrderDraft {
  workspaceId: string | null
  plan: GhostPlanKey
  cycle: Cycle
  profiles: number
  seats: number
  proxies: number
  numbers: number
}

/**
 * Checks an order can actually be fulfilled BEFORE the customer pays.
 *
 * Catches the predictable failures — sold-out proxy stock, a bundle that
 * would assign nothing, a missing price ID — while they can still change
 * their selection. Far better than a refund conversation afterwards.
 *
 * Debounced, because it re-runs on every stepper click.
 *
 * A failed check reports NO issues rather than a blocking one: the checkout
 * path validates everything again server-side, so the cost of being wrong
 * here is a clearer error later, whereas blocking on a network blip loses a
 * legitimate sale.
 */
export function useOrderValidation(draft: OrderDraft): {
  issues: Issue[]
  checking: boolean
  blocked: boolean
} {
  const [issues, setIssues] = useState<Issue[]>([])
  const [checking, setChecking] = useState(false)

  const key = JSON.stringify(draft)

  useEffect(() => {
    if (!draft.workspaceId) return
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        try {
          const client = getSupabase()
          if (!client) return
          const { data } = await client.auth.getSession()
          const token = data.session?.access_token
          if (!token) return

          setChecking(true)
          const res = await fetch('/api/billing/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: key
          })
          const json = (await res.json().catch(() => ({}))) as { issues?: Issue[] }
          if (!cancelled) setIssues(res.ok ? (json.issues ?? []) : [])
        } catch {
          if (!cancelled) setIssues([])
        } finally {
          if (!cancelled) setChecking(false)
        }
      })()
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key, draft.workspaceId])

  return { issues, checking, blocked: issues.some((i) => i.blocking) }
}

// Owns invitation data for the Members page: list, create, revoke, resend.
// Delegates to InvitationService (lib/invitations.ts); RLS + RPCs enforce
// permissions server-side. Keeps a local optimistic copy for snappy UI.

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as InvitationService from '@/lib/invitations'
import type {
  CreateInvitationResult,
  InvitationRow,
  InviteInput,
  MutateInvitationResult
} from '@/lib/invitations'

export interface InvitationView extends InvitationRow {
  roleName: string
  isExpired: boolean
}

export interface UseInvitationsDataResult {
  invitations: InvitationView[]
  pending: InvitationView[]
  loading: boolean
  error: string | null
  refresh: () => void
  create: (input: InviteInput) => Promise<CreateInvitationResult>
  revoke: (id: string) => Promise<MutateInvitationResult>
  resend: (id: string) => Promise<MutateInvitationResult>
}

export function useInvitationsData(
  workspaceId: string | null,
  roleNameById: Map<string, string>,
  enabled: boolean
): UseInvitationsDataResult {
  const [rows, setRows] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // A coarse clock (updated every 30s) drives expiry without impure Date.now()
  // calls in render. Seeded lazily so the first paint has a real timestamp.
  const [nowTs, setNowTs] = useState<number>(() => new Date().getTime())
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(new Date().getTime()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    InvitationService.listInvitations(workspaceId)
      .then((data) => !cancelled && setRows(data))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled, nonce])

  const { invitations, pending } = useMemo(() => {
    const all = rows.map((r) => ({
      ...r,
      roleName: roleNameById.get(r.role_id) ?? '—',
      isExpired: r.status === 'pending' && new Date(r.expires_at).getTime() <= nowTs
    }))
    return { invitations: all, pending: all.filter((i) => i.status === 'pending' && !i.isExpired) }
  }, [rows, roleNameById, nowTs])

  const create: UseInvitationsDataResult['create'] = async (input) => {
    if (!workspaceId) return { ok: false, reason: 'unknown', message: 'No workspace' }
    const r = await InvitationService.createInvitation(workspaceId, input)
    if (r.ok) setRows((prev) => [r.invitation, ...prev])
    return r
  }

  const revoke: UseInvitationsDataResult['revoke'] = async (id) => {
    const r = await InvitationService.revokeInvitation(id)
    if (r.ok) setRows((prev) => prev.map((x) => (x.id === id ? r.invitation : x)))
    return r
  }

  const resend: UseInvitationsDataResult['resend'] = async (id) => {
    const r = await InvitationService.resendInvitation(id)
    if (r.ok) setRows((prev) => prev.map((x) => (x.id === id ? r.invitation : x)))
    return r
  }

  return { invitations, pending, loading, error, refresh, create, revoke, resend }
}

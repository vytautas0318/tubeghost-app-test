// Owns profile fetch + create/update/delete mutations.

import { useEffect, useState } from 'react'
import {
  createProfile,
  deleteProfile,
  getProfile,
  updateProfile,
  type ProfileRow
} from '@/lib/profiles'
import { rowToForm, type FormState } from './types'
import { resolveProxyDraft, type ProxyDraft } from './proxy-draft'

export interface UseProfileEditorDataResult {
  profile: ProfileRow | null
  setProfile: (p: ProfileRow | null) => void
  form: FormState
  setForm: (f: FormState) => void
  loading: boolean
  saving: boolean
  setSaving: (v: boolean) => void
  error: string | null
  setError: (e: string | null) => void
  // Resolves to null when the save failed (see `error`). `note` is set when
  // the save succeeded but the proxy request degraded (e.g. auto mode found
  // an empty pool) — returned rather than stored in state so the caller can
  // act on it in the same tick it navigates away.
  save: (
    workspaceId: string,
    isNew: boolean,
    id?: string,
    proxyDraft?: ProxyDraft
  ) => Promise<{ row: ProfileRow; note?: string } | null>
  remove: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>
  reload: () => Promise<void>
}

export function useProfileEditorData(
  id: string | undefined,
  isNew: boolean
): UseProfileEditorDataResult {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [form, setForm] = useState<FormState>(rowToForm(null))
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) {
      setForm(rowToForm(null))
      setProfile(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getProfile(id!)
      .then((row) => {
        if (cancelled) return
        if (!row) {
          setError('Profile not found')
        } else {
          setProfile(row)
          setForm(rowToForm(row))
          setError(null)
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const save = async (
    workspaceId: string,
    isNewArg: boolean,
    idArg?: string,
    proxyDraft?: ProxyDraft
  ): Promise<{ row: ProfileRow; note?: string } | null> => {
    setSaving(true)
    setError(null)
    try {
      if (isNewArg) {
        // Single-step creation: the proxy the user configured on the Proxy
        // tab is resolved now (auto mode re-checks the pool) and written with
        // the INSERT, so there's no create-then-attach round trip.
        let proxy = null
        let note: string | undefined
        if (proxyDraft) {
          const resolved = await resolveProxyDraft(workspaceId, proxyDraft)
          if (!resolved.ok) {
            setError(resolved.error)
            return null
          }
          proxy = resolved.fields
          note = resolved.note
        }
        const created = await createProfile({
          workspace_id: workspaceId,
          name: form.name.trim() || 'Untitled profile',
          group_id: form.group_id,
          notes: form.notes || null,
          tags: form.tags,
          proxy
        })
        return { row: created, note }
      }
      const updated = await updateProfile(idArg!, {
        name: form.name.trim() || 'Untitled profile',
        group_id: form.group_id,
        notes: form.notes || null,
        tags: form.tags
      })
      setProfile(updated)
      // Re-sync the form so the General tab's dirty comparison clears
      // immediately (otherwise the user keeps seeing "unsaved" warnings
      // even right after Save).
      setForm(rowToForm(updated))
      return { row: updated }
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setSaving(false)
    }
  }

  const remove = async (
    idArg: string
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      await deleteProfile(idArg)
      return { ok: true }
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      return { ok: false, message: msg }
    }
  }

  return {
    profile,
    setProfile,
    form,
    setForm,
    loading,
    saving,
    setSaving,
    error,
    setError,
    save,
    remove,
    reload: async () => {
      if (isNew || !id) return
      const r = await getProfile(id)
      if (r) {
        setProfile(r)
        setForm(rowToForm(r))
      }
    }
  }
}

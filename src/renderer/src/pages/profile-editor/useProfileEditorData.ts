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
  save: (workspaceId: string, isNew: boolean, id?: string) => Promise<ProfileRow | null>
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
    idArg?: string
  ): Promise<ProfileRow | null> => {
    setSaving(true)
    setError(null)
    try {
      if (isNewArg) {
        return await createProfile({
          workspace_id: workspaceId,
          name: form.name.trim() || 'Untitled profile',
          group_id: form.group_id,
          notes: form.notes || null,
          tags: form.tags
        })
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
      return updated
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

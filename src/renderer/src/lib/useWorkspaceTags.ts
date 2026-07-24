// Shared hook: load the workspace tag registry (migration 0019) with realtime,
// plus create/edit/delete mutations and a name→color resolver. Used by both the
// Profiles and Authenticator tag UIs so colors stay consistent app-wide.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import {
  listTags,
  createTag as createTagRow,
  updateTag as updateTagRow,
  deleteTag as deleteTagRow,
  makeTagColorMap,
  type TagRow
} from '@/lib/tags'

export interface UseWorkspaceTags {
  tags: TagRow[]
  colorFor: (name: string) => string
  createTag: (name: string, color: string) => Promise<void>
  editTag: (id: string, name: string, color: string) => Promise<void>
  removeTag: (id: string) => Promise<void>
}

// Per-hook-instance counter so two live mounts of this hook (it's used by the
// Profiles AND Authenticator tag UIs at once) never claim the same realtime
// channel name. Reusing a channel name returns the existing, already-
// subscribed channel, and calling `.on('postgres_changes', …)` on it throws
// "cannot add callbacks after subscribe()". A unique suffix avoids the clash.
let tagsChannelSeq = 0

export function useWorkspaceTags(workspaceId: string | null): UseWorkspaceTags {
  const [tags, setTags] = useState<TagRow[]>([])
  // Stable per-instance id via a lazy useState initializer (runs once, never
  // touches a ref during render).
  const [instanceId] = useState(() => ++tagsChannelSeq)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    listTags(workspaceId)
      .then((t) => !cancelled && setTags(t))
      .catch(() => undefined)
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel(`tags:${workspaceId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tags', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          setTags((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as TagRow
              return prev.some((t) => t.id === row.id) ? prev : [...prev, row]
            }
            if (payload.eventType === 'DELETE')
              return prev.filter((t) => t.id !== (payload.old as TagRow).id)
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as TagRow
              return prev.map((t) => (t.id === row.id ? row : t))
            }
            return prev
          })
        }
      )
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [workspaceId, instanceId])

  const colorFor = useMemo(() => makeTagColorMap(tags), [tags])

  const createTag = useCallback(
    async (name: string, color: string): Promise<void> => {
      if (!workspaceId) return
      const row = await createTagRow(workspaceId, name, color)
      setTags((prev) => (prev.some((t) => t.id === row.id) ? prev : [...prev, row]))
    },
    [workspaceId]
  )
  const editTag = useCallback(async (id: string, name: string, color: string): Promise<void> => {
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, name, color } : t)))
    await updateTagRow(id, { name, color })
  }, [])
  const removeTag = useCallback(async (id: string): Promise<void> => {
    setTags((prev) => prev.filter((t) => t.id !== id))
    await deleteTagRow(id)
  }, [])

  return { tags, colorFor, createTag, editTag, removeTag }
}

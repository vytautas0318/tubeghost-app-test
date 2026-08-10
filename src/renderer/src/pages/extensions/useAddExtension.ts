// Add-extension flows (.crx upload + Web Store fetch), shared by the header
// buttons, the dashed add-card, and the Browse tab's Add buttons.
//
// Both paths converge on the same parser: get raw .crx/.zip bytes →
// parseExtensionArchive() → persist the Supabase row. An uploaded file is
// already in the browser, so it needs no server at all; the Web Store path
// goes through the extension-fetch Edge Function purely to defeat CORS.
//
// The desktop build also had to clean up on-disk files when the row insert
// failed (RLS / plan gate). The web app writes no files, so a failed insert
// leaves nothing behind — the error just propagates to the caller's toast.

import { useCallback, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { createExtension, type ExtensionWithAssignment } from '@/lib/extensions'
import { parseExtensionArchive, extractWebStoreId, type ParsedExtension } from '@/lib/crx'

interface UseAddExtensionResult {
  busy: boolean
  // Import from a picked .crx / .zip File.
  addFromFile: (workspaceId: string, file: File) => Promise<ExtensionWithAssignment>
  // Import from a Web Store id or pasted CWS URL.
  addFromWebStore: (workspaceId: string, urlOrId: string) => Promise<ExtensionWithAssignment>
}

// The Edge Function returns a JSON { error } body on failure. supabase-js
// wraps that in a FunctionsHttpError whose `context` is the raw Response —
// unwrap it so the user sees the real reason, not "Edge Function returned a
// non-2xx status code".
async function edgeErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: unknown }
      if (typeof body?.error === 'string' && body.error) return body.error
    } catch {
      // Non-JSON body — fall through to the generic message.
    }
  }
  return (error as Error)?.message || 'Web Store fetch failed.'
}

async function fetchCrxBytes(webStoreId: string): Promise<Uint8Array> {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  // The function replies with application/octet-stream, which supabase-js
  // surfaces as a Blob.
  const { data, error } = await c.functions.invoke<Blob>('extension-fetch', {
    body: { webStoreId }
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  if (!data) throw new Error('Web Store returned no data.')
  return new Uint8Array(await data.arrayBuffer())
}

export function useAddExtension(): UseAddExtensionResult {
  const [busy, setBusy] = useState(false)

  const persist = useCallback(
    async (
      workspaceId: string,
      parsed: ParsedExtension,
      source: 'crx_upload' | 'web_store',
      webStoreId: string | null
    ): Promise<ExtensionWithAssignment> => {
      const row = await createExtension({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        name: parsed.name,
        publisher: parsed.publisher,
        version: parsed.version,
        description: parsed.description,
        source_type: source,
        web_store_id: webStoreId,
        icon_data_url: parsed.iconDataUrl,
        category: parsed.category,
        permission_scope: parsed.permissionScope,
        manifest: parsed.manifest
      })
      return { ...row, groupIds: [], profileIds: [] }
    },
    []
  )

  const addFromFile = useCallback<UseAddExtensionResult['addFromFile']>(
    async (workspaceId, file) => {
      setBusy(true)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        return await persist(workspaceId, parseExtensionArchive(bytes), 'crx_upload', null)
      } finally {
        setBusy(false)
      }
    },
    [persist]
  )

  const addFromWebStore = useCallback<UseAddExtensionResult['addFromWebStore']>(
    async (workspaceId, urlOrId) => {
      setBusy(true)
      try {
        const id = extractWebStoreId(urlOrId)
        if (!id) {
          throw new Error('That does not look like a Chrome Web Store link or extension id.')
        }
        const bytes = await fetchCrxBytes(id)
        return await persist(workspaceId, parseExtensionArchive(bytes), 'web_store', id)
      } finally {
        setBusy(false)
      }
    },
    [persist]
  )

  return { busy, addFromFile, addFromWebStore }
}

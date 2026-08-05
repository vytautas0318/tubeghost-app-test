// extension-fetch — download a Chrome Web Store extension's .crx bytes.
//
// Why an Edge Function: clients2.google.com serves no CORS headers, so the
// renderer cannot fetch a .crx directly. This function is a thin authenticated
// byte-proxy — it downloads and hands the bytes back. ALL parsing (unzip,
// manifest, icon, permission scope) happens in the renderer via lib/crx.ts,
// so the uploaded-.crx path and the Web Store path share one parser.
//
// Auth: requires a valid Supabase user JWT. No workspace check is needed —
// this touches no workspace data; the RLS policy on the subsequent
// `extensions` insert is what enforces permission + plan gating.
//
// IMPORTANT: programmatic CWS downloads are unofficial and can break at any
// time (Google may change the endpoint, add anti-automation, or gate by
// Chrome version). Every failure returns a clear message; the renderer
// surfaces it and points the user at .crx upload.

import { handleCors, corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

// A 32-char a–p extension id. The renderer already extracts this from a
// pasted URL; we re-validate rather than trust it.
const ID_RE = /^[a-p]{32}$/

// A recent stable Chrome build + the "not chrome branded" defaults Google's
// endpoint expects. `acceptformat=crx2,crx3` makes it hand back a .crx blob.
function updateUrl(id: string): string {
  const params = new URLSearchParams({
    response: 'redirect',
    acceptformat: 'crx2,crx3',
    prodversion: '120.0.0.0',
    x: `id=${id}&installsource=ondemand&uc`
  })
  return `https://clients2.google.com/service/update2/crx?${params.toString()}`
}

Deno.serve(async (req) => {
  const pre = handleCors(req)
  if (pre) return pre

  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)
  if (!getUserIdFromRequest(req)) return jsonResponse({ error: 'unauthorized' }, 401)

  let body: { webStoreId?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const id = typeof body.webStoreId === 'string' ? body.webStoreId.trim() : ''
  if (!ID_RE.test(id)) {
    return jsonResponse({ error: 'That does not look like a Chrome Web Store extension id.' }, 400)
  }

  // Deno's fetch follows the redirect chain to the actual crx blob for us.
  let res: Response
  try {
    res = await fetch(updateUrl(id), {
      headers: { 'User-Agent': 'TubeGhostBrowser' },
      redirect: 'follow'
    })
  } catch (e) {
    return jsonResponse({ error: `Could not reach the Web Store: ${(e as Error).message}` }, 502)
  }

  if (res.status === 204) {
    return jsonResponse(
      { error: 'Web Store returned no update — the extension id may be wrong or unlisted.' },
      404
    )
  }
  if (!res.ok) {
    return jsonResponse({ error: `Web Store fetch failed (HTTP ${res.status}).` }, 502)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength < 16) {
    return jsonResponse({ error: 'Web Store returned an empty response.' }, 502)
  }

  return new Response(bytes, {
    headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' }
  })
})

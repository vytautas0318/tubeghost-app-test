// /api/oauth/authorize/approve — the SPA consent step.
//
// GET  ?rid=...  → { clientName, scopes, devices: [{name, online}] }
//                  Details for the consent screen. Session-authed.
// POST { rid }   → { redirect }   the final redirect_uri?code=...&state=...
//                  Session-authed: the logged-in user grants the request; we
//                  mint a single-use code bound to their userId + the request's
//                  PKCE challenge.
//
// Both reuse the EXISTING Supabase session (Authorization: Bearer <access
// token>). This is where the OAuth grant is bound to a real logged-in user — no
// second identity system.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../../env.js'
import { requireSession } from '../../session.js'
import { getClient, getRequest, delRequest, putCode, randomId, type AuthCode } from '../../oauth-store.js'
import { listDevices } from '../../db.js'
import { onlineSet } from '../../bus.js'

function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  const session = await requireSession(req.headers.authorization)
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const rid =
    req.method === 'GET'
      ? String((Array.isArray(req.query.rid) ? req.query.rid[0] : req.query.rid) ?? '')
      : String(parseBody(req).rid ?? '')
  const request = rid ? await getRequest(rid) : null
  if (!request) {
    res.status(400).json({ error: 'request_expired', error_description: 'Authorization request not found or expired' })
    return
  }

  // ── GET: consent details (app name, scopes, reachable devices) ────
  if (req.method === 'GET') {
    const client = await getClient(request.client_id)
    const rows = await listDevices(session.userId)
    const online = await onlineSet(rows.map((d) => d.id))
    res.status(200).json({
      clientName: client?.client_name ?? 'A Claude connector',
      scopes: request.scope.split(/\s+/).filter(Boolean),
      devices: rows.map((d) => ({ name: d.name, online: online.has(d.id) })),
    })
    return
  }

  // ── POST: grant → mint code → return the client redirect ──────────
  if (req.method === 'POST') {
    const code = randomId(24)
    const rec: AuthCode = {
      code,
      client_id: request.client_id,
      user_id: session.userId,
      redirect_uri: request.redirect_uri,
      scope: request.scope,
      code_challenge: request.code_challenge,
      resource: request.resource,
    }
    await putCode(rec)
    await delRequest(rid) // consent consumes the pending request

    const u = new URL(request.redirect_uri)
    u.searchParams.set('code', code)
    if (request.state) u.searchParams.set('state', request.state)
    res.status(200).json({ redirect: u.toString() })
    return
  }

  res.status(405).json({ error: 'method_not_allowed' })
}

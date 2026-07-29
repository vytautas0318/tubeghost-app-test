// GET /api/oauth/authorize — OAuth 2.1 authorization endpoint (PKCE required).
//
// CALLED BY: the user's browser, redirected here by Claude. We validate the
// request against the registered client, then hand off to the SPA consent
// route (which reuses the existing Supabase login session — logging the user in
// first if needed). The pending request is stashed in Redis under a short id so
// it survives the login+consent round-trip; the browser only carries the `rid`.
//
// On any client/redirect error we render a plain error (never redirect an
// unvalidated redirect_uri). On a valid request with a bad protocol param we
// redirect back to the client with error=... per OAuth.
//
// Query: client_id, redirect_uri, response_type=code, scope, state,
//        code_challenge, code_challenge_method=S256, resource

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PUBLIC_BASE_URL, relayConfigured } from '../../env.js'
import { getClient, putRequest, randomId } from '../../oauth-store.js'

function q(req: VercelRequest, k: string): string {
  const v = req.query[k]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

function fail(res: VercelResponse, code: number, msg: string): void {
  res.status(code).setHeader('Content-Type', 'text/plain')
  res.send(`OAuth error: ${msg}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!relayConfigured()) {
    fail(res, 500, 'server_error')
    return
  }

  const clientId = q(req, 'client_id')
  const redirectUri = q(req, 'redirect_uri')
  const responseType = q(req, 'response_type')
  const scope = q(req, 'scope') || 'mcp'
  const state = q(req, 'state') || null
  const challenge = q(req, 'code_challenge')
  const challengeMethod = q(req, 'code_challenge_method')
  const resource = q(req, 'resource') || null

  // 1. Validate the client + redirect_uri BEFORE trusting either enough to
  //    redirect to. An unregistered client or unregistered redirect => render
  //    an error, never redirect.
  const client = await getClient(clientId)
  if (!client) {
    fail(res, 400, 'unknown client_id')
    return
  }
  if (!client.redirect_uris.includes(redirectUri)) {
    fail(res, 400, 'redirect_uri not registered for this client')
    return
  }

  // 2. From here redirect_uri is trusted — protocol errors go back to the client.
  const back = (err: string, desc?: string): void => {
    const u = new URL(redirectUri)
    u.searchParams.set('error', err)
    if (desc) u.searchParams.set('error_description', desc)
    if (state) u.searchParams.set('state', state)
    res.redirect(302, u.toString())
  }

  if (responseType !== 'code') {
    back('unsupported_response_type')
    return
  }
  // PKCE S256 REQUIRED — reject missing or non-S256.
  if (!challenge || challengeMethod !== 'S256') {
    back('invalid_request', 'PKCE with code_challenge_method=S256 is required')
    return
  }

  // 3. Stash the validated request; the browser carries only the opaque rid.
  const rid = randomId(18)
  await putRequest({
    rid,
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
  })

  // 4. Hand off to the SPA consent route. It resolves the Supabase session
  //    (redirecting to /signin if needed) and calls /api/oauth/authorize/approve.
  const consent = new URL('/oauth/consent', PUBLIC_BASE_URL)
  consent.searchParams.set('rid', rid)
  res.redirect(302, consent.toString())
}

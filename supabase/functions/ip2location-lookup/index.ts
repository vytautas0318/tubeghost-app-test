// ip2location-lookup — geo enrichment for an IP address.
//
// Why an Edge Function: the IP2LOCATION_API_KEY is a secret (paid quota),
// must NEVER ship to the renderer. Lives in Supabase Edge secrets only.
//
// Request:  POST { ip: '1.2.3.4' }
// Response: { country_code, country_name, city, region, timezone } | { error }

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const API_KEY = Deno.env.get('IP2LOCATION_API_KEY')

interface LookupRequest {
  ip: string
}

interface IP2LocationResponse {
  ip?: string
  country_code?: string
  country_name?: string
  region_name?: string
  city_name?: string
  time_zone?: string
  // ip2location returns this field when there's an error
  error?: { error_message?: string }
}

interface LookupResult {
  country_code: string | null
  country_name: string | null
  city: string | null
  region: string | null
  timezone: string | null
}

// Tight IPv4 + IPv6 validation. Reject anything that isn't a real IP — we
// don't want to forward arbitrary strings to ip2location and burn quota.
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every((p) => {
      const n = Number(p)
      return n >= 0 && n <= 255
    })
  }
  // IPv6 (loose — covers compressed and full forms)
  return /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})$/.test(
    ip
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (!API_KEY) {
    return jsonResponse({ error: 'IP2LOCATION_API_KEY is not configured on the server' }, 500)
  }

  const userId = getUserIdFromRequest(req)
  if (!userId) {
    return jsonResponse({ error: 'authentication required' }, 401)
  }

  let body: LookupRequest
  try {
    body = (await req.json()) as LookupRequest
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const ip = (body.ip ?? '').trim()
  if (!isValidIp(ip)) {
    return jsonResponse({ error: 'invalid ip address' }, 400)
  }

  try {
    const url = `https://api.ip2location.io/?key=${encodeURIComponent(API_KEY)}&ip=${encodeURIComponent(ip)}&format=json`
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) {
      return jsonResponse(
        { error: `ip2location returned ${r.status}` },
        r.status >= 500 ? 502 : 400
      )
    }
    const data = (await r.json()) as IP2LocationResponse
    if (data.error) {
      return jsonResponse({ error: data.error.error_message ?? 'ip2location error' }, 400)
    }
    const result: LookupResult = {
      country_code: data.country_code ?? null,
      country_name: data.country_name ?? null,
      city: data.city_name ?? null,
      region: data.region_name ?? null,
      timezone: data.time_zone ?? null
    }
    return jsonResponse(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: `lookup failed: ${msg}` }, 502)
  }
})

// sync-proxy-status — TubeProxies proxy_inventory -> TP Browser proxies.
//
// DEPLOY: TubeProxies project (qkntgnepntnbnqipuavv).
// TRIGGER: Supabase database webhook on public.proxy_inventory
//          INSERT + UPDATE. One-way (TubeProxies is master for purchased
//          proxies). See RUNBOOK.md.
//
// This IS the purchase-fulfillment path for proxies (decision #3): rather
// than relocate the existing Stripe webhook, we react to the row the
// existing fulfillment writes into proxy_inventory. When a purchased
// proxy is assigned to a buyer (assigned_to set), we push it into that
// buyer's TP Browser workspace as source='tubeproxies', UNASSIGNED to any
// browser profile. Status changes (release/expiry/rotation) flow through
// the same UPDATE path.
//
// A proxy with no buyer (assigned_to null — sitting in inventory) is NOT
// pushed: nothing to fulfill yet.
//
// PEER_* secrets point at TP Browser here.

import {
  WebhookPayload,
  verifyWebhookSecret,
  peerClient,
  selfClient,
  enqueueOutbox,
  ok,
  deny
} from '../_shared/sync.ts'

interface ProxyInventory {
  id: string
  ip_address: string
  port: number
  username: string
  password: string
  status: string | null
  proxy_type: string | null
  assigned_to: string | null
  country_code: string | null
  country_name: string | null
  city_name: string | null
  region_name: string | null
  time_zone: string | null
}

// Map TubeProxies/IP2Location proxy classification -> TP Browser
// connection protocol. TubeProxies sells HTTP(S) residential proxies, so
// everything except an explicit socks5 marker becomes 'http'. TP Browser
// only accepts http|https|socks5 (proxies_proxy_type_check).
function protocolFor(t: string | null): 'http' | 'https' | 'socks5' {
  const v = (t ?? '').toLowerCase()
  if (v === 'socks5' || v === 'socks') return 'socks5'
  if (v === 'https') return 'https'
  return 'http'
}

// Map TubeProxies proxy_inventory.status -> TP Browser proxies.status
// (active|expired|released|error). TubeProxies vocabulary:
//   available | assigned          -> active   (usable by the buyer)
//   needs_review | retired        -> released (back in the pool / gone)
//   paused | login_not_working    -> error    (temporarily unusable)
function statusFor(s: string | null): 'active' | 'expired' | 'released' | 'error' {
  switch ((s ?? '').toLowerCase()) {
    case 'available':
    case 'assigned':
      return 'active'
    case 'needs_review':
    case 'retired':
      return 'released'
    case 'paused':
    case 'login_not_working':
      return 'error'
    default:
      return 'active'
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method not allowed')
  if (!verifyWebhookSecret(req)) return deny(401, 'bad sync secret')

  let body: WebhookPayload<ProxyInventory>
  try {
    body = await req.json()
  } catch {
    return deny(400, 'invalid json')
  }

  const inv = body.record
  if (!inv || !inv.id) return ok({ skipped: 'no record' })

  // Only fulfill proxies that belong to a buyer. Unassigned inventory
  // has nothing to mirror.
  if (!inv.assigned_to) return ok({ skipped: 'unassigned inventory', id: inv.id })

  const tpb = peerClient()
  const args = {
    p_tubeproxies_id: inv.id,
    p_buyer_user_id: inv.assigned_to,
    // TP Browser proxies.proxy_type is a CONNECTION PROTOCOL
    // (http|https|socks5), NOT IP2Location's classification
    // (RES/VPN/DCH/…, which lives on inv.proxy_type). TubeProxies proxies
    // are HTTP residential proxies with user/pass auth, so we map to the
    // protocol here; the IP2Location classification is geo/fraud metadata
    // that TP Browser doesn't model and is intentionally dropped.
    p_proxy_type: protocolFor(inv.proxy_type),
    p_host: inv.ip_address,
    p_port: inv.port,
    p_username: inv.username,
    p_password: inv.password,
    p_status: statusFor(inv.status),
    p_country_code: inv.country_code,
    p_country_name: inv.country_name,
    p_city: inv.city_name,
    p_region: inv.region_name,
    p_timezone: inv.time_zone,
    p_expires_at: null
  }

  const { data, error } = await tpb.rpc('sync_upsert_purchased_proxy', args)

  if (error) {
    // "mirror pending" (P0001) and transient errors both queue for retry.
    await enqueueOutbox('proxy', inv.id, 'upsert', 'sync_upsert_purchased_proxy', args, error)
    return deny(500, `proxy sync failed: ${error.message}`)
  }

  // Watermark on the source row so ops can see it synced.
  try {
    const self = selfClient()
    await self
      .from('proxy_inventory')
      .update({ tubeghost_synced_at: new Date().toISOString() })
      .eq('id', inv.id)
  } catch (_e) {
    // watermark is best-effort; the mirror already succeeded.
  }

  return ok({ synced: inv.id, tp_browser_proxy: data })
})

// Proxy connectivity + egress-IP test.
//
// In the web app this goes through the `proxy-test` Supabase Edge Function
// (supabase/functions/proxy-test/index.ts), which makes an HTTPS request to
// ip2location.io THROUGH the user-supplied proxy and returns the egress IP +
// geo. The IP2LOCATION_API_KEY is a server secret held by the edge function;
// the user's JWT is attached automatically by supabase-js.
//
// (Was previously a main-process Electron IPC handler; that path is gone.)

import { getSupabase } from '@/lib/supabase'

export interface ProxyTestRequest {
  proxy_type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string | null
  password?: string | null
  expected_egress_ip?: string | null
  timeout_ms?: number
}

export interface ProxyTestOk {
  ok: true
  egress_ip: string
  egress_matches_expected: boolean | null
  elapsed_ms: number
  // Geo enrichment the edge function returns alongside the egress IP.
  country_code?: string | null
  country_name?: string | null
  city?: string | null
  region?: string | null
  timezone?: string | null
}

export interface ProxyTestErr {
  ok: false
  error: string
  stage: 'validate' | 'connect' | 'auth' | 'request' | 'parse' | 'timeout'
  elapsed_ms: number
}

export type ProxyTestResult = ProxyTestOk | ProxyTestErr

export async function testProxy(req: ProxyTestRequest): Promise<ProxyTestResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, error: 'Supabase not configured', stage: 'validate', elapsed_ms: 0 }
  }
  const { data, error } = await supabase.functions.invoke<ProxyTestResult>('proxy-test', {
    body: req
  })
  if (error) {
    return { ok: false, error: error.message, stage: 'request', elapsed_ms: 0 }
  }
  if (!data) {
    return { ok: false, error: 'proxy-test returned no data', stage: 'parse', elapsed_ms: 0 }
  }
  return data
}

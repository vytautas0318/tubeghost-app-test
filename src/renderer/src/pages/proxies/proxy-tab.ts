// Tab identity shared by the Proxies page and its tab bar. Kept out of the
// component file so fast-refresh only sees component exports there.

export type ProxyTab = 'tubeproxies' | 'custom'

export function isProxyTab(v: string | undefined): v is ProxyTab {
  return v === 'tubeproxies' || v === 'custom'
}

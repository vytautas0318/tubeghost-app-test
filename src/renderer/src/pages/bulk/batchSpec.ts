// Batch spec + name generation for bulk create.
//
// Split from BatchForm so that file exports only a component (react-refresh
// requires component-only exports) and this logic stays unit-testable.

export type ProxyMode = 'pool' | 'none'
export type FpMode = 'random' | 'shared'

// Social network the batch is for. DISPLAY ONLY — the app doesn't model a
// per-profile network anywhere, so this drives the preview icon and nothing
// else. Kept out of the DB deliberately rather than adding a column that
// nothing reads.
export type SocialPlatform = 'yt' | 'ig' | 'tt' | 'x' | 'fb' | 'am'

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  yt: 'YouTube',
  ig: 'Instagram',
  tt: 'TikTok',
  x: 'X',
  fb: 'Facebook',
  am: 'Amazon'
}

export interface BatchSpec {
  prefix: string
  start: number
  count: number
  platform: string
  groupId: string | null
  proxyMode: ProxyMode
  optimized: boolean
  social: SocialPlatform
  fpMode: FpMode
}

// Creating hundreds at once is a support problem, not a feature: the plan cap
// and the proxy pool are both finite, and an accidental extra zero is easy.
export const MAX_BATCH = 60

/** Zero-padded running number, so names sort correctly in a list of hundreds. */
export function padNum(n: number): string {
  return String(n).padStart(2, '0')
}

export function batchNames(spec: BatchSpec): string[] {
  const out: string[] = []
  const prefix = spec.prefix.trim() || 'Profile'
  for (let i = 0; i < spec.count; i++) {
    out.push(`${prefix} — ${padNum(spec.start + i)}`)
  }
  return out
}

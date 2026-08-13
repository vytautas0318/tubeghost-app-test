// YouTube channel lookup for the "Link channel" action on a profile card.
//
// The design prototype mocked this against a hard-coded table
// (ui_kits/browser/ProfileCards.jsx → ytLookup). Here it is the real
// YouTube Data API v3, which needs an API key: set VITE_YOUTUBE_API_KEY.
//
// Without a key the lookup still SUCCEEDS — it just returns what can be
// derived from the URL the user pasted (handle + a title guessed from it)
// with no subscriber count or avatar. That keeps "link a channel" working
// on a fresh checkout instead of failing with a config error, and the card
// degrades to exactly what it can honestly show.

export interface LinkedChannel {
  title: string
  // Always stored with the leading '@'.
  handle: string
  // Human-formatted subscriber count ("412K"). Null when unknown — either
  // no API key, or the channel hides its count.
  subs: string | null
  thumbnail: string | null
  channelId: string | null
  linkedAt: string
}

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined

export function hasYouTubeApiKey(): boolean {
  return !!API_KEY
}

// What kind of identifier the user pasted. The Data API needs a different
// query parameter for each, and guessing wrong returns an empty result
// rather than an error, so parse before calling.
type Ref =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'username'; value: string }

/**
 * Parse anything a user is likely to paste into a channel reference:
 * a full URL (/channel/UC…, /@handle, /c/name, /user/name), a bare
 * @handle, or a bare handle. Returns null when nothing usable is found.
 */
export function parseChannelRef(raw: string): Ref | null {
  const s = raw.trim()
  if (!s) return null

  const path = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(.+)$/i)?.[1]
  if (path) {
    const seg = path.split(/[?#]/)[0].replace(/\/+$/, '')
    const [first, second] = seg.split('/')
    if (first === 'channel' && second) return { kind: 'id', value: second }
    if (first === 'user' && second) return { kind: 'username', value: second }
    if (first === 'c' && second) return { kind: 'username', value: second }
    if (first.startsWith('@')) return { kind: 'handle', value: first.slice(1) }
    // Any other single segment is the legacy vanity form (youtube.com/Name).
    if (first && !second) return { kind: 'username', value: first }
    return null
  }

  if (/^UC[A-Za-z0-9_-]{20,}$/.test(s)) return { kind: 'id', value: s }
  const bare = s.replace(/^@/, '')
  // Handles are [A-Za-z0-9._-], 3–30 chars. Anything else isn't a channel.
  if (/^[A-Za-z0-9._-]{3,30}$/.test(bare)) return { kind: 'handle', value: bare }
  return null
}

// 412000 → "412K". Matches the design's copy ("412K subs").
function formatSubs(raw: string | undefined): string | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

interface ApiChannel {
  id?: string
  snippet?: {
    title?: string
    customUrl?: string
    thumbnails?: { default?: { url?: string }; medium?: { url?: string } }
  }
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean }
}

function fromRef(ref: Ref): LinkedChannel {
  const value = ref.value
  return {
    title: value.charAt(0).toUpperCase() + value.slice(1),
    handle: ref.kind === 'id' ? value : `@${value}`,
    subs: null,
    thumbnail: null,
    channelId: ref.kind === 'id' ? value : null,
    linkedAt: new Date().toISOString()
  }
}

/**
 * Resolve a pasted channel URL/handle to the snippet stored on the profile.
 * Throws only when the input isn't a channel reference at all, or when the
 * API answers and says no such channel — a missing key or a network failure
 * degrades to the URL-derived result rather than blocking the link.
 */
export async function lookupChannel(raw: string): Promise<LinkedChannel> {
  const ref = parseChannelRef(raw)
  if (!ref) throw new Error('Paste a channel URL or @handle')
  if (!API_KEY) return fromRef(ref)

  const param = ref.kind === 'id' ? 'id' : ref.kind === 'handle' ? 'forHandle' : 'forUsername'
  const value = ref.kind === 'handle' ? `@${ref.value}` : ref.value
  const url =
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
    `&${param}=${encodeURIComponent(value)}&key=${encodeURIComponent(API_KEY)}`

  let json: { items?: ApiChannel[]; error?: { message?: string } }
  try {
    const res = await fetch(url)
    json = (await res.json()) as typeof json
    // A bad/over-quota key is a config problem, not a "no such channel" —
    // linking what we parsed is more useful than refusing outright.
    if (!res.ok) return fromRef(ref)
  } catch {
    return fromRef(ref)
  }

  const hit = json.items?.[0]
  if (!hit) {
    // A handle lookup that finds nothing is genuinely wrong input; a
    // vanity-URL lookup often just isn't resolvable via forUsername, so
    // fall back rather than reject.
    if (ref.kind === 'handle' || ref.kind === 'id') throw new Error('No such channel')
    return fromRef(ref)
  }

  const custom = hit.snippet?.customUrl
  return {
    title: hit.snippet?.title ?? fromRef(ref).title,
    handle: custom ? (custom.startsWith('@') ? custom : `@${custom}`) : fromRef(ref).handle,
    subs: hit.statistics?.hiddenSubscriberCount
      ? null
      : formatSubs(hit.statistics?.subscriberCount),
    thumbnail:
      hit.snippet?.thumbnails?.medium?.url ?? hit.snippet?.thumbnails?.default?.url ?? null,
    channelId: hit.id ?? null,
    linkedAt: new Date().toISOString()
  }
}

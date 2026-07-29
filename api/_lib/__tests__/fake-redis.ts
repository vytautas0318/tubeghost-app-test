// Minimal in-memory stand-in for the subset of @upstash/redis the relay uses.
// Enough for enqueue → poll → result and the OAuth code/refresh flows. TTLs are
// tracked but not expired on a timer (tests advance nothing); pass an explicit
// `now` bump via .expireNow() when a test needs a key gone.

type Val = string | number
interface Entry {
  v: unknown
  exp?: number // epoch ms; undefined = no expiry
}

export class FakeRedis {
  private store = new Map<string, Entry>()

  private live(key: string): Entry | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.exp !== undefined && e.exp <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return e
  }

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'> {
    this.store.set(key, { v: value, exp: opts?.ex ? Date.now() + opts.ex * 1000 : undefined })
    return 'OK'
  }
  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.live(key)?.v as T) ?? null
  }
  async getdel<T = unknown>(key: string): Promise<T | null> {
    const e = this.live(key)
    if (!e) return null
    this.store.delete(key)
    return e.v as T
  }
  async del(...keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) if (this.store.delete(k)) n++
    return n
  }
  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key)
    if (!e) return 0
    e.exp = Date.now() + seconds * 1000
    return 1
  }
  async exists(key: string): Promise<number> {
    return this.live(key) ? 1 : 0
  }
  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    return keys.map((k) => (this.live(k)?.v as T) ?? null)
  }

  // Lists (LPUSH producer / RPOP consumer → FIFO).
  async lpush(key: string, ...values: Val[]): Promise<number> {
    const e = this.live(key)
    const arr = (e?.v as unknown[]) ?? []
    arr.unshift(...values)
    this.store.set(key, { v: arr, exp: e?.exp })
    return arr.length
  }
  async rpop<T = unknown>(key: string): Promise<T | null> {
    const e = this.live(key)
    const arr = (e?.v as unknown[]) ?? []
    if (arr.length === 0) return null
    const out = arr.pop() as T
    this.store.set(key, { v: arr, exp: e?.exp })
    return out
  }

  // Sets.
  async sadd(key: string, ...members: string[]): Promise<number> {
    const e = this.live(key)
    const s = (e?.v as Set<string>) ?? new Set<string>()
    let added = 0
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m)
        added++
      }
    }
    this.store.set(key, { v: s, exp: e?.exp })
    return added
  }
  async sismember(key: string, member: string): Promise<number> {
    const s = this.live(key)?.v as Set<string> | undefined
    return s?.has(member) ? 1 : 0
  }
  async smembers<T = string[]>(key: string): Promise<T> {
    const s = this.live(key)?.v as Set<string> | undefined
    return [...(s ?? [])] as T
  }

  // SCAN — single pass returning all matching keys (cursor always resolves to 0).
  async scan(_cursor: string, opts?: { match?: string; count?: number }): Promise<[string, string[]]> {
    const match = opts?.match
    const re = match ? new RegExp('^' + match.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : '\\' + m)) + '$') : null
    const keys = [...this.store.keys()].filter((k) => this.live(k) && (!re || re.test(k)))
    return ['0', keys]
  }

  // Test helpers.
  clear(): void {
    this.store.clear()
  }
  raw(): Map<string, Entry> {
    return this.store
  }
}

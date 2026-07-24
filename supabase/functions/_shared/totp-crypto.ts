// AES-GCM encryption for TOTP secrets, plus RFC-6238 code generation.
//
// The key comes from the TOTP_ENC_KEY Edge secret (32 bytes, base64). It
// NEVER leaves the server — the renderer and DB only ever hold the
// ciphertext this module produces. Format of a stored value:
//   v1.<base64(iv)>.<base64(ciphertext+tag)>
// The v1 prefix lets us rotate the scheme later without ambiguity.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

let cachedKey: CryptoKey | null = null

// Import the raw 32-byte key from the base64 Edge secret. Throws (caught by
// the caller → 500) if the secret is missing or the wrong length.
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = Deno.env.get('TOTP_ENC_KEY')
  if (!raw) throw new Error('TOTP_ENC_KEY is not configured on the server')
  const keyBytes = b64decode(raw.trim())
  if (keyBytes.length !== 32) {
    throw new Error('TOTP_ENC_KEY must be 32 bytes (base64-encoded)')
  }
  cachedKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt'
  ])
  return cachedKey
}

// Encrypt a Base32 TOTP secret → "v1.<iv>.<ct>" storage string.
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  )
  return `v1.${b64encode(iv)}.${b64encode(ct)}`
}

// Decrypt a "v1.<iv>.<ct>" storage string back to the Base32 secret.
export async function decryptSecret(stored: string): Promise<string> {
  const parts = stored.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('unrecognized ciphertext format')
  }
  const key = await getKey()
  const iv = b64decode(parts[1])
  const ct = b64decode(parts[2])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return decoder.decode(pt)
}

// ── RFC-6238 TOTP (SHA1/256/512, N digits, given period) ────────────────
// Small, dependency-free implementation using WebCrypto HMAC. Kept here so
// the function has no npm/deno-registry import to resolve at deploy time.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('invalid base32 secret')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

const HASH_NAME: Record<string, string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512'
}

export interface TotpParams {
  secret: string // Base32
  algorithm?: string
  digits?: number
  period?: number
  // Unix seconds to compute the code for; defaults to now. Passed in so a
  // batch computes every code against one consistent timestamp.
  atSeconds?: number
}

export async function generateTotp(p: TotpParams): Promise<string> {
  const algorithm = (p.algorithm ?? 'SHA1').toUpperCase()
  const hash = HASH_NAME[algorithm]
  if (!hash) throw new Error(`unsupported algorithm ${algorithm}`)
  const digits = p.digits ?? 6
  const period = p.period ?? 30
  const now = p.atSeconds ?? Math.floor(Date.now() / 1000)
  const counter = Math.floor(now / period)

  // 8-byte big-endian counter.
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }

  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(p.secret),
    { name: 'HMAC', hash },
    false,
    ['sign']
  )
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 10 ** digits).padStart(digits, '0')
}

// Validate a Base32 secret by decoding it and generating one code.
export async function validateSecret(secret: string): Promise<boolean> {
  try {
    await generateTotp({ secret })
    return true
  } catch {
    return false
  }
}

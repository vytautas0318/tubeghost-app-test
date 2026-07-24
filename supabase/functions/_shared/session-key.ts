// Per-workspace session-archive key derivation.
//
// The master secret SESSION_ENC_KEY (32 bytes, base64) NEVER leaves the
// server. For each workspace we derive a distinct 32-byte AES key via
// HKDF-SHA256 so a leak of one workspace's derived key can't decrypt another
// workspace's snapshots. The derived key is handed to the client (main
// process) which does the actual AES-256-GCM of the (large) archive locally —
// routing hundreds of MB of session data through an Edge Function would be
// absurd, so we ship the key, not the payload. Same trust model as
// TOTP_ENC_KEY: a real secret gated behind a permission check.

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

const encoder = new TextEncoder()

let cachedMaster: CryptoKey | null = null

// Import the master secret as an HKDF base key. Throws (→ 500) if missing or
// the wrong length.
async function getMaster(): Promise<CryptoKey> {
  if (cachedMaster) return cachedMaster
  const raw = Deno.env.get('SESSION_ENC_KEY')
  if (!raw) throw new Error('SESSION_ENC_KEY is not configured on the server')
  const keyBytes = b64decode(raw.trim())
  if (keyBytes.length !== 32) {
    throw new Error('SESSION_ENC_KEY must be 32 bytes (base64-encoded)')
  }
  cachedMaster = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveBits'])
  return cachedMaster
}

// Derive the 32-byte AES key for a workspace, returned base64. Deterministic:
// the same workspace always derives the same key, so a snapshot uploaded from
// machine A decrypts on machine B.
export async function deriveWorkspaceKey(workspaceId: string): Promise<string> {
  const master = await getMaster()
  // Salt is a fixed context label; info binds the derivation to the workspace.
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('tubeghost.session.v1'),
      info: encoder.encode(`workspace:${workspaceId}`)
    },
    master,
    256
  )
  return b64encode(new Uint8Array(bits))
}

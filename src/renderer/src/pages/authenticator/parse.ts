// otpauth:// URI + setup-key parsing for the Add-account flow. Uses the
// vetted `otpauth` library (RFC-6238) so we don't hand-roll Base32/HMAC.
// Renderer-side we only PARSE + validate; actual code generation and
// encryption happen server-side in the totp Edge Function.

import * as OTPAuth from 'otpauth'
import jsQR from 'jsqr'
import type { AuthPlatform } from '@/lib/authenticator'

export interface ParsedSecret {
  secret: string // Base32, uppercased, no spaces
  issuer: string
  handle: string
  algorithm: string
  digits: number
  period: number
}

// Map a free-text issuer to one of our brand-tile platforms.
export function platformForIssuer(issuer: string): AuthPlatform {
  const s = issuer.toLowerCase()
  if (s.includes('youtube') || s.includes('google')) return 'yt'
  if (s.includes('instagram')) return 'ig'
  if (s.includes('tiktok')) return 'tt'
  if (s === 'x' || s.includes('twitter')) return 'x'
  if (s.includes('facebook') || s.includes('meta')) return 'fb'
  if (s.includes('amazon')) return 'am'
  return 'other'
}

function normalizeBase32(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

// Decode an otpauth:// URI out of an uploaded QR image.
//
// Two decoders, tried in order:
//   1. The built-in BarcodeDetector — it delegates to a NATIVE OS framework
//      that most browsers do not have. Chrome/Android and Chrome/macOS ship it;
//      Chrome on WINDOWS and LINUX do not, and neither Firefox nor Safari
//      implements it at all. Where it is missing the constructor is undefined.
//   2. jsQR — pure JS, behaves the same in every browser.
//
// The fallback is unconditional rather than gated on `!BarcodeDetector`: when
// the native detector exists but finds nothing, jsQR still gets a turn. The two
// disagree on marginal images more often than you'd expect (low contrast,
// rotation, scaled screenshots).
//
// Before the fallback existed this returned null for most of the browser
// market and the dialog told those users their image was unreadable.
export async function decodeQr(file: File): Promise<string | null> {
  return (await decodeQrNative(file)) ?? (await decodeQrFallback(file))
}

async function decodeQrNative(file: File): Promise<string | null> {
  const Detector = (
    globalThis as {
      BarcodeDetector?: new (o: { formats: string[] }) => {
        detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]>
      }
    }
  ).BarcodeDetector
  if (!Detector) return null
  try {
    const bitmap = await createImageBitmap(file)
    const det = new Detector({ formats: ['qr_code'] })
    const codes = await det.detect(bitmap)
    return codes[0]?.rawValue ?? null
  } catch {
    return null
  }
}

/**
 * Read an image file as a `data:` URL, for the upload preview thumbnail.
 *
 * Deliberately NOT URL.createObjectURL: the app's CSP allows
 * `img-src 'self' data: https:` and does NOT list blob:, so an object URL
 * renders as a broken image. See src/renderer/index.html. Resolves null if the
 * read fails.
 */
export function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

// jsQR wants raw RGBA, so the image goes through an offscreen canvas first.
async function decodeQrFallback(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // attemptBoth also tries inverted colours, so light-on-dark QRs (i.e. any
    // screenshot taken in dark mode) decode too.
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  } catch {
    return null
  }
}

// Validate a Base32 secret by constructing a TOTP and generating once.
export function isValidBase32(secret: string): boolean {
  try {
    const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(normalizeBase32(secret)) })
    return /^\d{6,8}$/.test(t.generate())
  } catch {
    return false
  }
}

// Parse either a full otpauth:// URI or a raw setup key (+ optional
// issuer/handle the user typed). Throws on an unusable secret.
export function parseInput(input: string, issuerHint = '', handleHint = ''): ParsedSecret {
  const text = input.trim()
  if (text.toLowerCase().startsWith('otpauth://')) {
    const t = OTPAuth.URI.parse(text)
    if (!(t instanceof OTPAuth.TOTP)) throw new Error('Only TOTP (time-based) codes are supported')
    return {
      secret: t.secret.base32,
      issuer: t.issuer || issuerHint || 'Account',
      handle: t.label || handleHint || '',
      algorithm: t.algorithm,
      digits: t.digits,
      period: t.period
    }
  }
  const secret = normalizeBase32(text)
  if (!isValidBase32(secret)) throw new Error('That doesn’t look like a valid setup key')
  return {
    secret,
    issuer: issuerHint.trim() || 'Account',
    handle: handleHint.trim(),
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  }
}

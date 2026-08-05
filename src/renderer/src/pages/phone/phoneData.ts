// Shared types + tag palette for the Phone numbers page. Numbers/SMS arrive
// from the TubeProxies phone-number subscription (integration pending) — the
// page starts empty; nothing here is sample data.
import type { BadgeTone, Platform } from '@/components/ui'

export type Tag = [BadgeTone, string] // [tone, label]

export type PhoneNum = {
  id: string
  number: string
  area: string
  profile: string
  pl: Platform | null
  code: string | null
  from: string | null
  tags?: Tag[]
}

export type Sms = {
  id: string
  // The number of YOURS that received this message — what you need to know to
  // tell one inbox from another. `from` is the sender's shortcode (e.g. 22000).
  to: string
  from: string
  body: string
  code: string
  time: string
  pl: Platform
}
export type ProfileOpt = { name: string; pl: Platform | null }

// Suggested tag palette for numbers (feature config, not data).
export const TAG_TONES: Tag[] = [
  ['red', 'flagship'],
  ['amber', 'warm'],
  ['blue', 'clips'],
  ['violet', 'ecom'],
  ['green', 'new'],
  ['neutral', 'official']
]

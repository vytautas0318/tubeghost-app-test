// Non-component helpers for the Profiles Simple view: which view is showing,
// and where a card's popover should be placed. Kept out of the .tsx files so
// those export components only (React Fast Refresh requirement).

export type ProfilesView = 'simple' | 'advanced'

const KEY = 'tpb.profiles.view'

/**
 * The persisted view. Simple when nothing is stored — most sessions are
 * "find a profile, launch it", which the card grid answers in one glance.
 */
export function readStoredView(): ProfilesView {
  try {
    return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

export function storeView(v: ProfilesView): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* ignore — private mode / storage disabled */
  }
}

export interface Anchor {
  x: number
  y: number
}

// Link-channel popover box, for the clamping maths below.
const POP_W = 268
const POP_H = 152
const PAD = 12

/**
 * Place a popover under `el` in VIEWPORT space, clamped to the window and
 * flipped above the trigger when there's no room below. Cards in the last
 * grid column would otherwise push it off-screen.
 */
export function anchorTo(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect()
  const x = Math.min(
    Math.max(PAD, r.left + r.width / 2 - POP_W / 2),
    window.innerWidth - POP_W - PAD
  )
  const below = r.bottom + 8
  const y = below + POP_H > window.innerHeight - PAD ? Math.max(PAD, r.top - 8 - POP_H) : below
  return { x, y }
}

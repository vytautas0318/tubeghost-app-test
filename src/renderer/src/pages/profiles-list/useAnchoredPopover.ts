// Anchored popover for the Profiles-list inline cells (Proxy / Tags / Group).
// Renders the panel into document.body via a portal with position:fixed, so the
// table's `overflow-auto` scroll container can't clip it — the bug where an
// `absolute` popover vanished for every row that wasn't near the top of the
// list (it opened downward into the clipped region and showed nothing).
//
// Positions below the trigger, flips above / clamps into the viewport when it
// would overflow, repositions on scroll + resize + content-resize, and closes
// on outside-click or Escape. Returns refs for the trigger button + the portal
// panel plus the computed fixed-position style. The caller renders the panel
// itself via createPortal(<div ref={panelRef} style={style}>…</div>, document.body).

import * as React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useAnchoredPopover(
  open: boolean,
  setOpen: (v: boolean) => void,
  width: number,
  // When true the panel is sized to the trigger instead of `width`, so a
  // full-width field (e.g. the editor's Tags select) gets a menu that lines up
  // with its box rather than a narrower fixed panel. `width` is still used as
  // the horizontal-clamp hint until the trigger has been measured.
  matchTriggerWidth = false
): {
  triggerRef: React.RefObject<HTMLButtonElement | null>
  panelRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
} {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    left: -9999,
    top: -9999
  })

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const t = triggerRef.current
      if (!t) return
      const r = t.getBoundingClientRect()
      const h = panelRef.current?.offsetHeight ?? 0
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = matchTriggerWidth ? r.width : width
      const left = Math.max(8, Math.min(r.left, vw - w - 8))
      let top = r.bottom + 4
      if (h && top + h > vh - 8) {
        // not enough room below → open above if it fits there, else clamp.
        top = r.top - h - 4 >= 8 ? r.top - h - 4 : Math.max(8, vh - h - 8)
      }
      const next: React.CSSProperties = matchTriggerWidth
        ? { position: 'fixed', left, top, width: w }
        : { position: 'fixed', left, top }
      setStyle((prev) =>
        prev.left === left && prev.top === top && prev.width === next.width ? prev : next
      )
    }
    place()
    // On the first pass the panel has not painted yet, so offsetHeight is 0 and
    // the flip-above branch is skipped — a trigger near the bottom of the
    // viewport then opened downward off-screen. Re-place once the browser has
    // laid the panel out and we can measure a real height.
    const raf = requestAnimationFrame(place)
    const ro = new ResizeObserver(place)
    if (panelRef.current) ro.observe(panelRef.current)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, width, matchTriggerWidth])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const n = e.target as Node
      if (triggerRef.current?.contains(n) || panelRef.current?.contains(n)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return { triggerRef, panelRef, style }
}

// Makes the assistant FAB draggable and remembers where the user put it.
// Position is stored as a distance from the RIGHT/BOTTOM edges (so it stays
// anchored sensibly when the window resizes) and persisted to localStorage.
//
// A small drag threshold distinguishes a click (open the panel) from a drag
// (move the button) so the two gestures don't fight.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface FabPosition {
  right: number
  bottom: number
}

// v2: default raised so the FAB clears the pagination bar at the bottom of
// list pages. Bumping the key resets any previously-saved (lower) position.
const STORAGE_KEY = 'tg.assistant.fab.v2'
const DEFAULT: FabPosition = { right: 24, bottom: 88 }
const FAB = 56 // button size, keep in sync with .as-fab in assistant.css
const MARGIN = 8 // keep the button this far from any edge
const DRAG_THRESHOLD = 4 // px before a press becomes a drag (vs a click)

function clampToViewport(pos: FabPosition): FabPosition {
  const maxRight = Math.max(MARGIN, window.innerWidth - FAB - MARGIN)
  const maxBottom = Math.max(MARGIN, window.innerHeight - FAB - MARGIN)
  return {
    right: Math.min(Math.max(MARGIN, pos.right), maxRight),
    bottom: Math.min(Math.max(MARGIN, pos.bottom), maxBottom)
  }
}

function load(): FabPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as FabPosition
      if (typeof p.right === 'number' && typeof p.bottom === 'number') return p
    }
  } catch {
    /* ignore */
  }
  return DEFAULT
}

export interface DraggableFab {
  pos: FabPosition
  dragging: boolean
  // Spread onto the FAB button. onPointerDown starts a potential drag; onClick
  // opens the panel but is suppressed when the press turned into a drag.
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}

export function useDraggableFab(onTap: () => void): DraggableFab {
  const [pos, setPos] = useState<FabPosition>(() => clampToViewport(load()))
  const [dragging, setDragging] = useState(false)
  // Mutable drag state kept in a ref so the move handler doesn't re-bind.
  const drag = useRef<{ startX: number; startY: number; base: FabPosition; moved: boolean } | null>(null)
  // True immediately after a drag so the click that follows pointerup is eaten.
  const justDragged = useRef(false)

  // Keep the button on-screen if the window shrinks.
  useEffect(() => {
    const onResize = (): void => setPos((p) => clampToViewport(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }, [pos])

  const onPointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (e.button !== 0) return
      drag.current = { startX: e.clientX, startY: e.clientY, base: pos, moved: false }

      const onMove = (ev: PointerEvent): void => {
        const d = drag.current
        if (!d) return
        const dx = ev.clientX - d.startX
        const dy = ev.clientY - d.startY
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        d.moved = true
        setDragging(true)
        // right/bottom grow as the pointer moves left/up.
        setPos(clampToViewport({ right: d.base.right - dx, bottom: d.base.bottom - dy }))
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        justDragged.current = !!drag.current?.moved
        drag.current = null
        setDragging(false)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [pos]
  )

  // Native click fires after pointerup. Open the panel unless we just dragged.
  const onClick = useCallback(
    (_e: React.MouseEvent): void => {
      if (justDragged.current) {
        justDragged.current = false
        return
      }
      onTap()
    },
    [onTap]
  )

  return { pos, dragging, onPointerDown, onClick }
}

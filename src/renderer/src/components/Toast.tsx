import * as React from 'react'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@tubeghost/ui'

export interface ToastState {
  kind: 'error' | 'info' | 'success'
  text: string
}

// Leading glyph per kind — always on the dark pill. Both success and info use
// the green success tick (the product uses toasts for positive confirmations);
// only genuine errors get the red glyph.
const TOAST_ICON: Record<ToastState['kind'], React.ReactElement> = {
  success: <CheckCircle2 size={16} style={{ color: '#2DD48A' }} />,
  info: <CheckCircle2 size={16} style={{ color: '#2DD48A' }} />,
  error: <XCircle size={16} style={{ color: '#EF0039' }} />
}

// Dark pill notification (matches the TubeGhost toast style) — a charcoal
// rounded pill with a colored status glyph + white label, consistent in both
// themes. Sits bottom-right of the VIEWPORT by default, or bottom-center when
// `position="bottom-center"`. Use with the useToast hook below.
//
// fixed, not absolute: an absolutely-positioned toast anchors to whichever
// scroll container it happens to render inside, so on a scrolled page it lands
// mid-document instead of at the bottom of the screen.
//
// z-[450] puts it above the detail drawers and overlays (z-50) — a toast fired
// from inside a drawer was rendering BEHIND it, clipped by the drawer edge —
// while staying below the blocking confirm modals at z-[500], which should
// never be obscured by a transient pill.
export function ToastView({
  toast,
  position = 'bottom-right'
}: {
  toast: ToastState | null
  position?: 'bottom-right' | 'bottom-center'
}): React.ReactElement | null {
  if (!toast) return null
  return (
    <div
      className={cn(
        'fixed bottom-4 z-[450]',
        position === 'bottom-center' ? 'left-1/2 -translate-x-1/2' : 'right-4'
      )}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
        maxWidth: '22rem',
        padding: '9px 15px',
        borderRadius: '10px',
        background: '#1F2023',
        color: '#F4F4F5',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.30)',
        fontSize: '13px',
        fontWeight: 550,
        fontFamily: 'var(--sans)',
        lineHeight: 1.3
      }}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{TOAST_ICON[toast.kind]}</span>
      {toast.text}
    </div>
  )
}

export function useToast(autoDismissMs = 4000): {
  toast: ToastState | null
  show: (kind: ToastState['kind'], text: string) => void
  clear: () => void
} {
  const [toast, setToast] = useState<ToastState | null>(null)
  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(null), autoDismissMs)
    return (): void => window.clearTimeout(t)
  }, [toast, autoDismissMs])
  return {
    toast,
    show: (kind, text) => setToast({ kind, text }),
    clear: () => setToast(null)
  }
}

import * as React from 'react'
import { useEffect } from 'react'
import { Eye, X } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'

export function PreviewBanner(): React.ReactElement | null {
  const preview = useWorkspace((s) => s.preview)
  const stopPreview = useWorkspace((s) => s.stopPreview)

  // Esc key shortcut to exit preview.
  useEffect(() => {
    if (!preview.active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stopPreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview.active, stopPreview])

  if (!preview.active) return null

  const subject = preview.asUserLabel
    ? `${preview.roleName} · ${preview.asUserLabel}`
    : preview.roleName

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-500 text-white text-xs font-medium shadow-md">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="flex items-center gap-1.5">
        Preview mode — viewing as
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/20 font-bold">
          {preview.roleColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: preview.roleColor }}
            />
          )}
          {subject}
        </span>
        <span className="opacity-80">— mutating actions are disabled</span>
      </span>
      <button
        onClick={stopPreview}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-semibold"
        title="Exit preview (Esc)"
      >
        <X className="h-3 w-3" />
        Exit preview
      </button>
    </div>
  )
}

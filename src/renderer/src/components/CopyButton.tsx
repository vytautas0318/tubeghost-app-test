import * as React from 'react'
import { Check, Copy } from 'lucide-react'

// Small inline "copy this value" affordance.
//
// Lives in components/ rather than a feature folder because more than one
// surface needs it (proxies table today; the drawer and API cards have their
// own older copies worth consolidating onto this later).
//
// Shows a tick for ~1.2s after a successful copy so the click has visible
// feedback even when the caller doesn't raise a toast. Toast and tick are
// complementary: the tick says "this button worked", the toast says "here is
// what landed on your clipboard".
export function CopyButton({
  value,
  title = 'Copy',
  onCopied,
  className
}: {
  value: string
  title?: string
  // Called only on success, so a caller's toast can't claim a copy that the
  // clipboard API actually rejected.
  onCopied?: (value: string) => void
  className?: string
}): React.ReactElement {
  const [done, setDone] = React.useState(false)
  // Cleared on unmount so a copy right before navigation can't setState on a
  // gone component.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const copy = async (e: React.MouseEvent): Promise<void> => {
    // Rows are clickable (they open the detail drawer) — copying must not also
    // navigate.
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return // no tick, no toast: the value is not on the clipboard
    }
    onCopied?.(value)
    setDone(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone(false), 1200)
  }

  return (
    <button
      type="button"
      className={'copy-btn' + (done ? ' done' : '') + (className ? ' ' + className : '')}
      title={done ? 'Copied' : title}
      aria-label={done ? 'Copied' : title}
      onClick={(e) => void copy(e)}
    >
      {done ? <Check /> : <Copy />}
    </button>
  )
}

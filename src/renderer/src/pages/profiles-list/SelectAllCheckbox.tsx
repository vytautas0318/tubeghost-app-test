// Header checkbox for the Profiles table. Three states: empty,
// indeterminate (some rows selected), checked (all rows selected).
// indeterminate must be set imperatively on the DOM element.

import * as React from 'react'
import { useEffect, useRef } from 'react'

export function SelectAllCheckbox({
  total,
  selectedCount,
  onToggle
}: {
  total: number
  selectedCount: number
  onToggle: (checked: boolean) => void
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  const allChecked = total > 0 && selectedCount === total
  const someChecked = selectedCount > 0 && selectedCount < total

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked
  }, [someChecked])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      onChange={(e) => onToggle(e.target.checked)}
      className="rounded accent-[var(--red)] cursor-pointer"
      title={
        allChecked ? 'Deselect all' : someChecked ? 'Clear selection' : 'Select all on this page'
      }
    />
  )
}

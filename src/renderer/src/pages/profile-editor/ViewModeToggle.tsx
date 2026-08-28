import * as React from 'react'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { SegmentedControl } from '@tubeghost/ui'
import type { ProfileView } from '@/store/prefs'

/**
 * Simple/Advanced switch for the profile editor header. Presentational — the
 * editor owns the mode so both variants keep rendering the same form state.
 */
export function ViewModeToggle({
  value,
  onChange
}: {
  value: ProfileView
  onChange: (v: ProfileView) => void
}): React.ReactElement {
  return (
    <SegmentedControl<ProfileView>
      value={value}
      onChange={onChange}
      options={[
        { value: 'simple', label: 'Simple', icon: <LayoutGrid size={14} /> },
        { value: 'advanced', label: 'Advanced', icon: <Rows3 size={14} /> }
      ]}
    />
  )
}

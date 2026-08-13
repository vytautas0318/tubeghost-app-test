// Simple ⇄ Advanced segmented control for the Profiles page header.
// Design: cards.css `.vw-switch` / `.vw-btn`.
//
// Simple is the card grid; Advanced is the full table — selection, bulk
// actions, inline editing, sorting, paging. State helpers live in
// ./cardViewState so this file exports a component only.

import * as React from 'react'
import type { ProfilesView } from './cardViewState'

export function ViewSwitch({
  view,
  onChange
}: {
  view: ProfilesView
  onChange: (v: ProfilesView) => void
}): React.ReactElement {
  return (
    <div className="vw-switch" role="group" aria-label="Profiles view">
      {(['simple', 'advanced'] as ProfilesView[]).map((v) => (
        <button
          key={v}
          type="button"
          className={'vw-btn' + (view === v ? ' on' : '')}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
        >
          {v === 'simple' ? 'Simple' : 'Advanced'}
        </button>
      ))}
    </div>
  )
}

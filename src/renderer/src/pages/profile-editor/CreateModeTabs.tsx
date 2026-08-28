import * as React from 'react'
import { useNavigate } from 'react-router-dom'

export type CreateDetail = 'guided' | 'simple' | 'advanced'

/**
 * Create-page mode switcher: Guided / Simple / Advanced, plus Single / Bulk.
 *
 * Bulk navigates to the existing /bulk page rather than duplicating it — that
 * flow already works and rebuilding it inline would be a rewrite, not a port.
 */
export function CreateModeTabs({
  detail,
  onDetail
}: {
  detail: CreateDetail
  onDetail: (d: CreateDetail) => void
}): React.ReactElement {
  const navigate = useNavigate()
  const tab = (d: CreateDetail, label: string): React.ReactElement => (
    <button
      type="button"
      className={'vw-btn' + (detail === d ? ' on' : '')}
      onClick={() => onDetail(d)}
    >
      {label}
    </button>
  )
  return (
    <>
      <div className="vw-switch">
        {tab('guided', 'Guided')}
        {tab('simple', 'Simple')}
        {tab('advanced', 'Advanced')}
      </div>
      <div className="vw-switch">
        <button type="button" className="vw-btn on">
          Single
        </button>
        <button type="button" className="vw-btn" onClick={() => navigate('/bulk')}>
          Bulk
        </button>
      </div>
    </>
  )
}

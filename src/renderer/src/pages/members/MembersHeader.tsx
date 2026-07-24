import * as React from 'react'

export function MembersHeader({ memberCount }: { memberCount: number }): React.ReactElement {
  return (
    <div className="px-6 pt-5 pb-4 border-b border-[var(--line)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--t1)]">Members</h2>
          <p className="text-xs text-[var(--t3)] mt-0.5">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </p>
        </div>
      </div>
    </div>
  )
}

import * as React from 'react'
import { cn } from '@/lib/cn'

export interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  saving?: boolean
  icon?: React.ReactNode
  indented?: boolean
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  saving,
  icon,
  indented
}: ToggleRowProps): React.ReactElement {
  return (
    <div className={cn('flex items-start gap-3', indented && 'ml-0')}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        title={disabled && !saving ? "You don't have permission" : undefined}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 mt-0.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          checked ? 'bg-[var(--red)]' : 'bg-[var(--hover)] border border-[var(--line)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
            'mt-[1px]'
          )}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--t1)] flex items-center gap-1.5">
          {icon}
          {label}
          {saving && <span className="text-[10px] text-[var(--t4)] ml-1">saving…</span>}
        </div>
        <div className="text-[11px] text-[var(--t3)] mt-0.5">{description}</div>
      </div>
    </div>
  )
}

import * as React from 'react'

export function NoiseToggle({
  label,
  checked,
  onChange,
  title
}: {
  label: string
  checked: boolean
  onChange: () => void
  title?: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      className="flex items-center gap-2 text-left"
    >
      <span
        className={
          checked
            ? 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--red)] transition-colors'
            : 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--hover)] border border-[var(--line)] transition-colors'
        }
      >
        <span
          className={
            checked
              ? 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[18px] mt-[1px]'
              : 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[2px] mt-[1px]'
          }
        />
      </span>
      <span className="text-xs text-[var(--t1)]">{label}</span>
    </button>
  )
}

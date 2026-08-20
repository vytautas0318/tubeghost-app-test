// Small presentational primitives shared across the profile-editor cards.

import * as React from 'react'

export function Tab({
  children,
  active = false,
  onClick
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'px-3 py-2.5 text-sm font-medium text-[var(--red)] border-b-2 border-[var(--red)]'
          : 'px-3 py-2.5 text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text'
      }
    >
      {children}
    </button>
  )
}

export function Section({
  title,
  subtitle,
  action,
  labelStyle = false,
  children
}: {
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  labelStyle?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow)] p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3
            className={
              labelStyle
                ? 'text-xs font-semibold uppercase tracking-wider text-[var(--t3)]'
                : 'text-[17px] font-[650] tracking-[-0.3px] text-[var(--t1)]'
            }
          >
            {title}
          </h3>
          {subtitle && <div className="text-[12px] text-[var(--t3)] mt-1">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--t2)] mb-[7px]">{label}</label>
      {children}
    </div>
  )
}

export function FpField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span className="text-[var(--t3)]">{label}</span>
      <div className="text-[var(--t1)] font-medium mt-0.5">{value}</div>
    </div>
  )
}

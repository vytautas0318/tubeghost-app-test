import * as React from 'react'
import { useState } from 'react'
import { AlertCircle, Check, Copy } from 'lucide-react'

export function Loading(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-[var(--t3)]">Loading…</div>
  )
}

export function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return (
    <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-lg px-3 py-2 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function Section({
  title,
  subtitle,
  labelStyle = false,
  children
}: {
  title: string
  subtitle?: React.ReactNode
  labelStyle?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-5">
      <div className="mb-4">
        <h3
          className={
            labelStyle
              ? 'text-xs font-semibold uppercase tracking-wider text-[var(--t3)]'
              : 'text-sm font-bold text-[var(--t1)]'
          }
        >
          {title}
        </h3>
        {subtitle && <div className="text-[var(--t3)] mt-0.5">{subtitle}</div>}
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
      <label className="block text-xs font-semibold text-[var(--t2)] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function CopyableMono({ value }: { value: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={onCopy}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs mono bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] hover:border-[var(--red)]/30 group"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[var(--green)] shrink-0" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-[var(--t4)] shrink-0 opacity-0 group-hover:opacity-100" />
      )}
    </button>
  )
}

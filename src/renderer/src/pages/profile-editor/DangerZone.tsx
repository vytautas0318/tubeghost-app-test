import * as React from 'react'

export function DangerZone({ onDelete }: { onDelete: () => void }): React.ReactElement {
  return (
    <section className="bg-[var(--panel)] border border-[var(--red-soft-2)] rounded-[var(--r-lg)] shadow-[var(--shadow)] p-5">
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--red)] mb-2">
        Danger zone
      </h3>
      <p className="text-[12.5px] text-[var(--t2)] mb-3.5 leading-relaxed">
        Deletes this profile. The proxy is released back to your TubeProxies inventory.
      </p>
      <button
        onClick={onDelete}
        className="w-full h-[38px] text-[13px] font-semibold border border-[var(--red-soft-2)] text-[var(--red)] rounded-[var(--r)] hover:bg-[var(--red-soft)] transition-colors"
      >
        Delete profile
      </button>
    </section>
  )
}

// Tiny shared helpers for the sidebar user/account block.

export function initialsOf(name?: string | null): string {
  return (
    name
      ?.split(/[\s@.]+/)
      .filter(Boolean)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || ''
  )
}

export function capitalize(s?: string | null): string {
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

// "{Plan} · {n} members", collapsing to "just you" for a solo workspace —
// matches the switcher/current-row subtitle in the design.
export function planMemberSummary(plan: string, memberCount: number): string {
  const p = capitalize(plan)
  if (memberCount <= 1) return `${p} · just you`
  return `${p} · ${memberCount} members`
}

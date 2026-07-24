import * as React from 'react'

/**
 * TeamHeaderContext — lets the two tab bodies (Members / Roles) push their
 * tab-specific page-header bits (subtitle line + primary action button) up
 * into the shared TeamPage header, without either body owning the header.
 *
 * The body calls useTeamHeaderSlot(...) inside a layout effect; TeamPage reads
 * the registered content and renders it beside the title + tab switcher. Only
 * the active tab is mounted, so exactly one body ever registers at a time.
 */
export interface TeamHeaderContent {
  /** The <p> subtitle line under the "Members" title. */
  subtitle: React.ReactNode
  /** Right-aligned header action (Invite member / Create role). */
  action: React.ReactNode
}

type Setter = (content: TeamHeaderContent | null) => void

/** TeamPage provides the setter; bodies consume it via useTeamHeaderSlot. */
export const TeamHeaderContext = React.createContext<Setter | null>(null)

/**
 * Register this tab body's subtitle + action button in the shared header.
 * Pass the deps its content depends on (permissions, counts, handlers) so it
 * re-registers when they change; it clears on unmount.
 */
export function useTeamHeaderSlot(content: TeamHeaderContent, deps: React.DependencyList): void {
  const set = React.useContext(TeamHeaderContext)
  React.useLayoutEffect(() => {
    set?.(content)
    return () => set?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, ...deps])
}

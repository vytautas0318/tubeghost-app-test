// Dirty-state + saver registry shared between the profile editor and
// its individual cards (Identity, Fingerprint, Advanced, …).
//
// Two registries:
//
//  • Dirty flags — each card calls useDirtyGuard(key, isDirty); the
//    parent reads the union before route-leave so unsaved edits can
//    be intercepted with a confirm.
//
//  • Savers — each card calls useRegisterSaver(key, saver); the parent
//    calls runAllSavers() when the top-right Save fires, so a single
//    click persists every tab's changes instead of just the active one.
//    Savers return SaveResult and MUST NOT trigger parent reloads on
//    their own — the parent does one reload after the batch completes,
//    so mid-batch reloads don't reset later cards' form state.

import * as React from 'react'

type DirtyMap = Record<string, boolean>

export type SaveResult = { ok: true } | { ok: false; error: string }
export type Saver = () => Promise<SaveResult>
type SaverMap = Record<string, Saver>

interface DirtyContextValue {
  setDirty: (key: string, value: boolean) => void
  isAnyDirty: () => boolean
  dirtyKeys: () => string[]
  registerSaver: (key: string, saver: Saver) => void
  unregisterSaver: (key: string) => void
  runAllSavers: () => Promise<
    { ok: true } | { ok: false; key: string; error: string }
  >
}

const Ctx = React.createContext<DirtyContextValue | null>(null)

export function DirtyProvider({
  children
}: {
  children: React.ReactNode
}): React.ReactElement {
  // Refs so we don't re-render the whole tree on every keystroke / save
  // registration.
  const dirtyRef = React.useRef<DirtyMap>({})
  const saverRef = React.useRef<SaverMap>({})

  const value: DirtyContextValue = React.useMemo(
    () => ({
      setDirty: (key, v) => {
        if (v) dirtyRef.current[key] = true
        else delete dirtyRef.current[key]
      },
      isAnyDirty: () => Object.keys(dirtyRef.current).length > 0,
      dirtyKeys: () => Object.keys(dirtyRef.current),
      registerSaver: (key, saver) => {
        saverRef.current[key] = saver
      },
      unregisterSaver: (key) => {
        delete saverRef.current[key]
      },
      runAllSavers: async () => {
        // Sequential — these all UPDATE the same row, so parallel
        // requests would race and only the last winner's columns
        // would land. Also: stop on first failure so the user can
        // fix the offending field without partial corruption from
        // savers further down the list.
        for (const key of Object.keys(saverRef.current)) {
          const r = await saverRef.current[key]()
          if (!r.ok) return { ok: false, key, error: r.error }
        }
        return { ok: true }
      }
    }),
    []
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Card hook. Pass the live dirty boolean; the registry stays in sync
// with mount/unmount automatically.
export function useDirtyGuard(key: string, dirty: boolean): void {
  const ctx = React.useContext(Ctx)
  React.useEffect(() => {
    ctx?.setDirty(key, dirty)
    return () => ctx?.setDirty(key, false)
  }, [ctx, key, dirty])
}

// Register a card's save function so the editor's top-right Save can
// flush every tab in one click. The wrapper that lands in the registry
// is stable for the card's lifetime; it dispatches to a ref so the
// always-latest saver closure runs even though we only register once.
export function useRegisterSaver(key: string, saver: Saver): void {
  const ctx = React.useContext(Ctx)
  const ref = React.useRef<Saver>(saver)
  // Refresh after every render so the registered wrapper always
  // dispatches to the latest closure (current form state, latest
  // validator, etc). Done in an effect, not inline, so it doesn't
  // mutate refs during the render phase.
  React.useEffect(() => {
    ref.current = saver
  })
  React.useEffect(() => {
    if (!ctx) return
    ctx.registerSaver(key, () => ref.current())
    return () => ctx.unregisterSaver(key)
  }, [ctx, key])
}

// Imperative accessor for the parent — `confirmIfDirty` returns true
// if it's safe to proceed (either no dirty state, or the user
// confirmed the discard).
export function useDirtyParent(): {
  confirmIfDirty: (action?: string) => boolean
  isAnyDirty: () => boolean
  runAllSavers: () => Promise<
    { ok: true } | { ok: false; key: string; error: string }
  >
} {
  const ctx = React.useContext(Ctx)
  return {
    confirmIfDirty: (action = 'leave this view') => {
      if (!ctx || !ctx.isAnyDirty()) return true
      const where = ctx.dirtyKeys().join(', ')
      return window.confirm(
        `You have unsaved changes in: ${where}.\n\nDiscard them and ${action}?`
      )
    },
    isAnyDirty: () => ctx?.isAnyDirty() ?? false,
    runAllSavers: () =>
      ctx?.runAllSavers() ?? Promise.resolve({ ok: true } as const)
  }
}

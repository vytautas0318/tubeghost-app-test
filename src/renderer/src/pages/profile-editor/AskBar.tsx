// The Simple editor's contextual assistant — the shell only: input,
// suggestion chips, and the applied/undo strip.
//
// Two parsers back it: askParse (deterministic, instant, offline) runs first,
// and anything it can't match goes to askModel (claude-haiku-4-5 via the
// assistant edge function). Nothing happens invisibly — every run reports
// which fields changed and offers a one-click Undo.

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { listProxies, listUnusedProxies, type ProxyRow } from '@/lib/proxies'
import { listGroups, type GroupRow } from '@/lib/groups'
import { parseAsk } from './askParse'
import { askModel, editToPatch } from './askModel'
import type { SimpleDraft } from './useSimpleDraft'

const EXAMPLES = [
  'Make it a mac profile on the Dallas IP',
  'Tag it flagship and put it in Crime Dynasty',
  'Fresh fingerprint, optimized for YouTube'
]

export function AskBar({
  draft,
  patch,
  workspaceId,
  currentProxyHost,
  knownTags,
  disabled,
  onPickProxy,
  onClearProxy,
  onToast
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  workspaceId: string | null
  currentProxyHost: string | null
  knownTags: string[]
  disabled: boolean
  onPickProxy: (p: ProxyRow) => void
  onClearProxy: () => void
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  // True while a model request is in flight (the fast path is synchronous).
  const [thinking, setThinking] = useState(false)
  const [proxies, setProxies] = useState<ProxyRow[]>([])
  // Free proxies, so "assign a proxy" hands out one nobody is on.
  const [unusedProxies, setUnusedProxies] = useState<ProxyRow[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  // The pre-run values of exactly the fields we changed, for Undo.
  const [done, setDone] = useState<{
    changes: string[]
    before: Partial<SimpleDraft>
  } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    void listProxies(workspaceId)
      .then((p) => !cancelled && setProxies(p))
      .catch(() => undefined)
    void listUnusedProxies(workspaceId)
      .then((p) => !cancelled && setUnusedProxies(p))
      .catch(() => undefined)
    void listGroups(workspaceId)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const ctx = useMemo(
    () => ({ draft, proxies, unusedProxies, groups, knownTags, currentProxyHost }),
    [draft, proxies, unusedProxies, groups, knownTags, currentProxyHost]
  )

  // Apply a parsed result to the draft + proxy, and show the Applied strip.
  const applyResult = (
    changes: string[],
    patchObj: Partial<SimpleDraft>,
    proxy?: ProxyRow | null
  ): void => {
    // Snapshot only the keys we're about to touch, so Undo can't clobber
    // anything the user changed by hand in the meantime.
    const before: Partial<SimpleDraft> = {}
    for (const k of Object.keys(patchObj) as (keyof SimpleDraft)[]) {
      before[k] = draft[k] as never
    }
    if (Object.keys(patchObj).length > 0) patch(patchObj)
    if (proxy) onPickProxy(proxy)
    else if (proxy === null) onClearProxy()
    setQ('')
    setOpen(false)
    setDone({ changes, before })
  }

  // Anything the fast path could not handle goes to the model: the same
  // assistant edge function + claude-haiku-4-5 the Copilot uses. This is what
  // makes arbitrary phrasing and questions work instead of silently failing.
  const runModel = async (text: string): Promise<void> => {
    setThinking(true)
    try {
      const r = await askModel(text, {
        draft,
        proxies,
        groups,
        knownTags,
        currentProxyHost
      })
      const patchObj = editToPatch(r.edit)
      const proxy =
        r.edit.proxy === null
          ? null
          : r.edit.proxy
            ? (proxies.find((p) => `${p.host}:${p.port}` === r.edit.proxy) ?? undefined)
            : undefined

      if (r.changes.length > 0) {
        applyResult(r.changes, patchObj, proxy)
        // A question answered alongside an edit still deserves showing.
        if (r.reply) onToast?.('info', r.reply)
      } else {
        // No edit — an answer to a question, or why nothing changed.
        onToast?.('info', r.reply ?? 'Nothing to change.')
        setQ('')
      }
    } catch (e) {
      onToast?.('error', `Assistant unavailable: ${(e as Error).message}`)
    } finally {
      setThinking(false)
    }
  }

  const run = (text: string): void => {
    if (disabled || thinking) return
    // Fast path: an exactly-recognised phrasing applies instantly, offline.
    const result = parseAsk(text, ctx)
    if (result.changes.length === 0) {
      // Nothing matched literally — hand the whole request to the model rather
      // than telling the user their perfectly reasonable sentence was wrong.
      void runModel(text)
      return
    }
    // The fast path understood it — apply without a round-trip. If it only
    // half-understood (a term matched nothing), let the model handle the whole
    // request instead so the unmatched half isn't silently dropped.
    if (result.unmatched.length > 0) {
      void runModel(text)
      return
    }
    applyResult(result.changes, result.patch, result.proxy)
  }

  const undo = (): void => {
    if (!done) return
    patch(done.before)
    setDone(null)
    onToast?.('info', 'Reverted')
  }

  return (
    <div className="ask" ref={wrapRef}>
      <div className="ask-bar">
        <span className="ask-ic" aria-hidden="true">
          <Sparkles />
        </span>
        <input
          value={q}
          disabled={disabled || thinking}
          placeholder={
            thinking ? 'Thinking…' : 'Describe what you want and TubeGhost sets it up…'
          }
          aria-label="Ask TubeGhost to set this profile up"
          onFocus={() => setOpen(true)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(q)
            if (e.key === 'Escape') {
              setOpen(false)
              e.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          className={'ask-go' + (q.trim() ? ' ready' : '')}
          disabled={disabled || thinking || !q.trim()}
          onClick={() => run(q)}
        >
          {thinking ? '…' : 'Ask'}
        </button>
      </div>

      {open && !q && !done && (
        <div className="ask-ex">
          <span className="ask-ex-k">Try</span>
          {EXAMPLES.map((x, i) => (
            <button
              type="button"
              key={x}
              className="ask-chip"
              style={{ animationDelay: `${60 + i * 70}ms` }}
              onClick={() => {
                setQ(x)
                run(x)
              }}
            >
              {x}
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className="ask-done" role="status">
          <span className="ask-done-k">
            <Check />
            Applied
          </span>
          <span className="ask-done-l">{done.changes.join(' · ')}</span>
          <button type="button" className="ask-undo" onClick={undo}>
            Undo
          </button>
          <button
            type="button"
            className="ask-x"
            aria-label="Dismiss"
            onClick={() => setDone(null)}
          >
            <X />
          </button>
        </div>
      )}
    </div>
  )
}

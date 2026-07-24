import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Lightbulb, X } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { NavIcon } from './sidebar/navIcons'

// Request categories shown as selectable chips (matches the TubeGhost mockup).
const CATEGORIES = ['Profiles', 'Proxies', 'Phone numbers', 'Automations', 'Team', 'Other'] as const
type Category = (typeof CATEGORIES)[number]

// Trending requests — surfaced as one-tap chips with a vote count. Static for
// now (no votes backend yet); clicking prefills the textarea + category.
const TRENDING: { label: string; votes: number; category: Category }[] = [
  { label: 'Mobile app', votes: 142, category: 'Other' },
  { label: 'SOCKS5 proxies', votes: 98, category: 'Proxies' },
  { label: 'Bulk cookie import', votes: 67, category: 'Profiles' }
]

/**
 * FeatureRequestButton — the lightbulb next to the RESOURCES label. Opens a
 * centered modal where the user picks a category and writes a feature request.
 * Saved to the `feature_requests` table (migration 0013); if that insert fails
 * (e.g. the migration isn't applied yet) it falls back to a pre-filled support
 * email so the request is never lost. Submitting shows a dark confirmation
 * toast ("Request submitted — thank you!").
 */
export function FeatureRequestButton(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category>('Profiles')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const user = useAuth((s) => s.user)
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    // Defer focus until the modal is painted.
    const t = window.setTimeout(() => textRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onEsc)
      window.clearTimeout(t)
    }
  }, [open])

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!confirmed) return
    const t = window.setTimeout(() => setConfirmed(false), 3200)
    return () => window.clearTimeout(t)
  }, [confirmed])

  const openModal = (): void => {
    setCategory('Profiles')
    setText('')
    setOpen(true)
  }

  const pickTrending = (t: (typeof TRENDING)[number]): void => {
    setCategory(t.category)
    setText((prev) => (prev.trim() ? prev : t.label))
    textRef.current?.focus()
  }

  const submit = async (): Promise<void> => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    try {
      const supabase = getSupabase()
      if (!supabase || !workspaceId) throw new Error('not configured')
      const { error } = await supabase.from('feature_requests').insert({
        workspace_id: workspaceId,
        user_id: user?.id ?? null,
        category,
        message,
        page: window.location.hash || null
      })
      if (error) throw error
    } catch {
      // Fallback channel — never lose the request.
      const subject = encodeURIComponent(`TubeGhost Browser — feature request (${category})`)
      const body = encodeURIComponent(message + '\n\n— ' + (user?.email ?? 'anonymous'))
      window.open(`mailto:support@tubeproxies.com?subject=${subject}&body=${body}`)
    } finally {
      setSending(false)
      setOpen(false)
      setConfirmed(true)
    }
  }

  return (
    <>
      <button className="nav-request" title="Request a feature" onClick={openModal}>
        <NavIcon name="bulb" size={14} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4"
            onMouseDown={() => setOpen(false)}
          >
            <div
              className="w-[440px] max-w-full bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                <span
                  className="shrink-0 grid place-items-center w-9 h-9 rounded-[var(--r)]"
                  style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                >
                  <Lightbulb size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-[650] text-[var(--t1)]">What do you need?</div>
                  <div className="text-[12.5px] text-[var(--t3)] mt-0.5">
                    Request a feature or resource — we prioritize by votes.
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="shrink-0 -mt-0.5 -mr-1 p-1.5 rounded-md text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--hover)] transition-colors"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 pb-5">
                {/* Category */}
                <div className="text-[12px] font-semibold text-[var(--t2)] mb-2">Category</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {CATEGORIES.map((c) => {
                    const on = c === category
                    return (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        className="h-8 px-3 rounded-[var(--r-pill)] text-[12.5px] font-[550] border transition-colors"
                        style={
                          on
                            ? {
                                background: 'var(--red-soft)',
                                color: 'var(--red)',
                                borderColor: 'var(--red)'
                              }
                            : {
                                background: 'var(--panel-2)',
                                color: 'var(--t2)',
                                borderColor: 'var(--line)'
                              }
                        }
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>

                {/* Request text */}
                <div className="text-[12px] font-semibold text-[var(--t2)] mb-2">Your request</div>
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
                  }}
                  rows={4}
                  placeholder="e.g. Add SOCKS5 proxies, bulk-assign phone numbers, a mobile app…"
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r)] text-[var(--t1)] placeholder:text-[var(--t4)] resize-y min-h-[92px] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
                />

                {/* Trending */}
                <div className="text-[12px] font-semibold text-[var(--t2)] mt-4 mb-2">
                  Trending requests
                </div>
                <div className="flex flex-wrap gap-2">
                  {TRENDING.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => pickTrending(t)}
                      className="inline-flex items-center gap-2 h-8 px-3 rounded-[var(--r-pill)] bg-[var(--panel-2)] border border-[var(--line)] hover:bg-[var(--hover)] text-[12.5px] font-[550] text-[var(--t2)] transition-colors"
                    >
                      {t.label}
                      <span className="text-[11px] text-[var(--t3)] tabular-nums">{t.votes}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--line)] bg-[var(--panel-2)]">
                <button
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--hover)] text-[13px] font-[550] text-[var(--t1)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={!text.trim() || sending}
                  className="h-9 px-4 rounded-[var(--r)] bg-[var(--red)] text-white text-[13px] font-semibold disabled:opacity-50 hover:bg-[var(--red-hover)] transition-colors"
                >
                  {sending ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {confirmed &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 z-[420]"
            style={{ bottom: '20px' }}
            role="status"
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '9px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: '#1F2023',
                color: '#F4F4F5',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.30)',
                fontSize: '13px',
                fontWeight: 550,
                fontFamily: 'var(--sans)',
                lineHeight: 1.3
              }}
            >
              <CheckCircle2 size={16} style={{ color: '#2DD48A', flexShrink: 0 }} />
              Request submitted — thank you!
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

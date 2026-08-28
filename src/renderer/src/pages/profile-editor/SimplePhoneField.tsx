// Simple-mode Phone number tile: link one of the workspace's numbers to this
// profile, or go order one.
//
// Wired to the existing phone feature (lib/phone-links + lib/phoneNumbers).
// "Order new" navigates to the in-app Phone numbers page at ?buy=1 — the same
// route the sidebar's buy shortcut uses, which scrolls to the price ladder.
// Pricing lives on that page, so it is not duplicated here where it could
// drift from the real figures.

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Phone, Plus, Search, X } from 'lucide-react'
import { clearPhoneLink, listPhoneLinks, setPhoneLink } from '@tubeghost/ui'
import { getPhoneOverview, type PhoneNumberRow } from '@/lib/phoneNumbers'
import { useAuth } from '@/store/auth'
import { formatPhone, phoneCountry } from '@/lib/phone-format'
import { Flag } from '@/components/Flag'

export function SimplePhoneField({
  profileId,
  workspaceId,
  onToast,
  onOrderNumber
}: {
  profileId: string | null
  workspaceId: string | null
  onToast?: (kind: 'error' | 'info', text: string) => void
  // Navigates to Phone numbers. Routed through the editor's dirty-guard so
  // unsaved edits prompt instead of being silently discarded.
  onOrderNumber: () => void
}): React.ReactElement {
  const userId = useAuth((s) => s.user?.id ?? null)
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([])
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'link' | 'order'>('link')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const reload = (): void => {
    if (!workspaceId) return
    void Promise.all([listPhoneLinks(workspaceId), getPhoneOverview(workspaceId)])
      .then(([l, o]) => {
        setLinks(l)
        setNumbers(o.phone_numbers)
      })
      .catch(() => undefined)
  }
  useEffect(reload, [workspaceId])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const linkedId = useMemo(
    () => [...links.entries()].find(([, pid]) => pid === profileId)?.[0] ?? null,
    [links, profileId]
  )
  const linked = useMemo(
    () => (linkedId ? (numbers.find((n) => n.id === linkedId) ?? null) : null),
    [numbers, linkedId]
  )

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return numbers.filter(
      (n) =>
        !needle ||
        `${n.phone_number ?? ''} ${formatPhone(n.phone_number)} ${n.label ?? ''}`
          .toLowerCase()
          .includes(needle)
    )
  }, [numbers, q])

  const link = async (n: PhoneNumberRow): Promise<void> => {
    if (!workspaceId || !profileId) return
    setBusy(true)
    try {
      await setPhoneLink(workspaceId, n.id, profileId, userId)
      setOpen(false)
      reload()
      onToast?.('info', 'Phone number linked')
    } catch (e) {
      onToast?.('error', `Could not link number: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (): Promise<void> => {
    if (!workspaceId || !linkedId) return
    setBusy(true)
    try {
      await clearPhoneLink(workspaceId, linkedId)
      reload()
      onToast?.('info', 'Phone number unlinked')
    } catch (e) {
      onToast?.('error', `Could not unlink number: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sa-cred-f" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <label>Phone number</label>
      {linked ? (
        <div className="sa-linked">
          <span className="sa-lk-ic ph">
            <Phone />
          </span>
          <span className="sa-lk-v mono">
            <Flag code={phoneCountry(linked.phone_number)} /> {formatPhone(linked.phone_number) || '—'}
          </span>
          <button
            type="button"
            className="sa-lk-x"
            aria-label="Unlink phone number"
            disabled={busy}
            onClick={() => void unlink()}
          >
            <X />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sa-link-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={!profileId}
          onClick={() => {
            setQ('')
            setOpen((v) => !v)
          }}
        >
          <Plus />
          Link or order a number
        </button>
      )}

      {open && (
        <div className="sa-px-pop" role="dialog" aria-label="Link or order a phone number">
          <div className="sa-ptabs">
            <button
              type="button"
              className={'sa-ptab' + (tab === 'link' ? ' on' : '')}
              onClick={() => setTab('link')}
            >
              Link existing
            </button>
            <button
              type="button"
              className={'sa-ptab' + (tab === 'order' ? ' on' : '')}
              onClick={() => setTab('order')}
            >
              Order new
            </button>
          </div>

          {tab === 'link' ? (
            <>
              <div className="sa-px-search">
                <Search />
                <input
                  autoFocus
                  value={q}
                  placeholder="Search number or area…"
                  aria-label="Search phone numbers"
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="sa-px-list">
                {list.map((n) => {
                  const takenBy = links.get(n.id)
                  return (
                    <button
                      type="button"
                      key={n.id}
                      className="sa-px-opt"
                      disabled={busy}
                      onClick={() => void link(n)}
                    >
                      <span className="sa-px-flag" aria-hidden="true">
                        <Flag code={phoneCountry(n.phone_number)} />
                      </span>
                      <span className="sa-px-ip">{formatPhone(n.phone_number) || '—'}</span>
                      <span className="sa-px-loc">
                        {n.label ? `${n.label} · ` : ''}
                        {takenBy
                          ? takenBy === profileId
                            ? 'This profile'
                            : 'Assigned'
                          : 'Unassigned'}
                      </span>
                    </button>
                  )
                })}
                {list.length === 0 && (
                  <div className="sa-px-empty">
                    {q ? `No number matches “${q}”.` : 'No numbers in this workspace yet.'}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="sa-order">
              <div className="sa-order-h">
                <div>
                  <div className="sa-order-t">Dedicated US number</div>
                  <div className="sa-order-s">Non-VoIP, assigned from available stock</div>
                </div>
              </div>
              <button
                type="button"
                className="sa-order-go"
                onClick={() => {
                  setOpen(false)
                  onOrderNumber()
                }}
              >
                Order a number
              </button>
              <span className="sa-fhint">
                Numbers are assigned automatically from stock, so the area code cannot be chosen.
                Ordering opens Phone numbers; the number appears here once it is provisioned.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

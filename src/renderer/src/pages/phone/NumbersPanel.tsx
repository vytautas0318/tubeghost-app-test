import { Badge, PlatformIcon, clearPhoneLink, setPhoneLink } from '@tubeghost/ui'
import * as React from 'react'
import { useEffect, useState } from 'react'
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Copy,
  Users
} from 'lucide-react'
import { NavIcon } from '@/components/sidebar/navIcons'
import { type ToastState } from '@/components/Toast'
import { Flag } from '@/components/Flag'
import { type PhoneNum, type ProfileOpt, type Tag } from './phoneData'
import { AssignPopover, TagPopover } from './popovers'
import { useAuth } from '@/store/auth'

type ShowFn = (kind: ToastState['kind'], text: string) => void
type Anchor = { id: string; x: number; y: number }

export function NumbersPanel({
  nums,
  setNums,
  profileOpts,
  workspaceId,
  onLinksChanged,
  show
}: {
  nums: PhoneNum[]
  setNums: React.Dispatch<React.SetStateAction<PhoneNum[]>>
  profileOpts: ProfileOpt[]
  workspaceId: string | null
  // Re-reads the links after a change, so the row reflects what was persisted
  // rather than only the optimistic local edit.
  onLinksChanged: () => void | Promise<void>
  show: ShowFn
}): React.ReactElement {
  const [q, setQ] = useState('')
  const [assign, setAssign] = useState<Anchor | null>(null)
  const [aq, setAq] = useState('')
  const [tagEdit, setTagEdit] = useState<Anchor | null>(null)
  const [menu, setMenu] = useState<(Anchor & { up: boolean }) | null>(null)

  // Dismiss any open popover/menu on outside click or scroll.
  useEffect(() => {
    if (!menu && !assign && !tagEdit) return undefined
    const close = (): void => {
      setMenu(null)
      setAssign(null)
      setAq('')
      setTagEdit(null)
    }
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menu, assign, tagEdit])

  const copy = (val: string): void => {
    try {
      navigator.clipboard?.writeText(val)
    } catch {
      /* clipboard may be unavailable */
    }
    show('success', `Copied ${val}`)
  }
  const openAssign = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setAq('')
    setAssign({ id, x: r.left, y: r.bottom + 6 })
  }
  // Assign (or clear) the profile a number is linked to, and PERSIST it.
  //
  // Previously this only mutated local state, so the assignment silently
  // vanished on refresh. The optimistic update stays for responsiveness, but a
  // failed write is rolled back by re-reading from the server.
  const setProfile = (id: string, opt: ProfileOpt | null): void => {
    const prev = nums.find((n) => n.id === id)?.profile ?? 'Unassigned'
    setNums((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, profile: opt ? opt.name : 'Unassigned', pl: opt ? opt.pl : null } : n
      )
    )
    setAssign(null)
    setAq('')

    if (!workspaceId) {
      show('error', 'No workspace selected.')
      return
    }

    void (async () => {
      try {
        if (opt) {
          await setPhoneLink(workspaceId, id, opt.id, useAuth.getState().user?.id ?? null)
        } else {
          await clearPhoneLink(workspaceId, id)
        }
        show('info', opt ? `Linked to ${opt.name}` : 'Number unassigned')
        await onLinksChanged()
      } catch (e) {
        // Roll the row back so the UI never claims a link that isn't stored.
        setNums((ns) => ns.map((n) => (n.id === id ? { ...n, profile: prev } : n)))
        show('error', `Couldn't save assignment: ${(e as Error).message}`)
      }
    })()
  }
  const openTag = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setTagEdit({ id, x: r.left, y: r.bottom + 6 })
  }
  const toggleTag = (id: string, t: Tag): void =>
    setNums((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n
        const tags = n.tags || []
        const has = tags.some(([, l]) => l === t[1])
        return { ...n, tags: has ? tags.filter(([, l]) => l !== t[1]) : [...tags, t] }
      })
    )
  const openMenu = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const up = r.bottom + 190 > window.innerHeight
    setMenu({ id, x: r.right - 180, y: up ? r.top - 6 : r.bottom + 6, up })
  }

  const shown = nums.filter(
    (n) => !q || (n.number + ' ' + n.profile).toLowerCase().includes(q.toLowerCase())
  )
  const assignNum = assign && nums.find((n) => n.id === assign.id)
  const tagNum = tagEdit && nums.find((n) => n.id === tagEdit.id)
  const menuNum = menu && nums.find((n) => n.id === menu.id)

  return (
    <div className="phone-panel">
      <div className="pp-head">
        <div className="pp-title">Active numbers</div>
        <div className="tb-search" style={{ width: '210px', height: '32px' }}>
          <Search size={14} />
          <input placeholder="Search numbers…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="pn-tbl">
        <div className="pn-th">
          <span>Phone number</span>
          <span>Linked profile</span>
          <span>Tags</span>
          <span>Status</span>
          <span />
        </div>
        {nums.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--t1)' }}>
              No numbers yet
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '4px' }}>
              Your US numbers appear here once you add them to your subscription.
            </div>
          </div>
        )}
        {shown.map((n) => (
          <div className="pn-tr" key={n.id}>
            <span className="pn-num">
              {/* Real SVG flag, not the 🇺🇸 emoji: the emoji sits on its own
                  baseline with a taller line-box than the mono digits beside
                  it, so the row read as misaligned — and Windows has no
                  regional-indicator glyphs at all (it renders bare "US"). */}
              <Flag code="US" size={18} />
              {n.number}
              {/* Copy is the single most common action on this page — a
                  verification flow needs the number pasted elsewhere — so it
                  gets an inline button rather than living only in the ⋮ menu. */}
              <button
                type="button"
                className="pn-copy"
                title="Copy number"
                onClick={(e) => {
                  e.stopPropagation()
                  copy(n.number)
                }}
              >
                <Copy size={13} />
              </button>
            </span>
            <span
              className="pn-link pn-link-edit"
              onClick={(e) => openAssign(e, n.id)}
              title="Assign to a profile"
            >
              {n.profile !== 'Unassigned' ? (
                <>
                  {n.pl && <PlatformIcon platform={n.pl} size={20} />}
                  <span className="phone-prof">{n.profile}</span>
                </>
              ) : (
                <span className="pn-addlabel">+ Assign profile</span>
              )}
              <ChevronDown className="pn-chev" size={13} />
            </span>
            <span className="pn-tags" onClick={(e) => openTag(e, n.id)} title="Edit tags">
              {n.tags && n.tags.length ? (
                n.tags.map(([tone, label]) => (
                  <Badge key={label} tone={tone}>
                    {label}
                  </Badge>
                ))
              ) : (
                <span className="pn-tag-add">+ tag</span>
              )}
            </span>
            <span>
              <Badge tone={n.profile === 'Unassigned' ? 'neutral' : 'green'}>
                {n.profile === 'Unassigned' ? 'Idle' : 'Active'}
              </Badge>
            </span>
            <span className="pn-actions">
              <div className="phone-kebab" onClick={(e) => openMenu(e, n.id)} title="Actions">
                <MoreVertical size={16} />
              </div>
            </span>
          </div>
        ))}
      </div>
      <div className="pn-foot">
        <span>
          Showing {shown.length === 0 ? 0 : 1}–{shown.length} of {nums.length}
        </span>
        <div className="pager">
          <div className="pg">
            <ChevronLeft size={14} />
          </div>
          <div className="pg on">1</div>
          <div className="pg">
            <ChevronRight size={14} />
          </div>
        </div>
      </div>

      {assignNum && (
        <AssignPopover
          num={assignNum}
          options={profileOpts}
          x={assign.x}
          y={assign.y}
          aq={aq}
          setAq={setAq}
          onPick={(opt) => setProfile(assignNum.id, opt)}
        />
      )}

      {tagNum && (
        <TagPopover
          num={tagNum}
          x={tagEdit.x}
          y={tagEdit.y}
          onToggle={(t) => toggleTag(tagNum.id, t)}
        />
      )}

      {menuNum && (
        <div
          style={{
            position: 'fixed',
            left: menu.x + 'px',
            top: menu.y + 'px',
            transform: menu.up ? 'translateY(-100%)' : undefined,
            zIndex: 200
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="row-menu" style={{ position: 'static', minWidth: '180px' }}>
            <div
              className="rm-item"
              onClick={() => {
                copy(menuNum.number)
                setMenu(null)
              }}
            >
              <Copy size={15} />
              Copy number
            </div>
            <div
              className="rm-item"
              onClick={(e) => {
                openAssign(e, menuNum.id)
                setMenu(null)
              }}
            >
              <NavIcon name="profiles" size={15} />
              Assign to profile
            </div>
            <div
              className="rm-item"
              onClick={() => {
                show('info', `Share ${menuNum.number} with team`)
                setMenu(null)
              }}
            >
              <Users size={15} />
              Share with team
            </div>
            {/*
              No "Release number" here (removed 2026-08-05). Releasing is a
              BILLING operation — it changes the TubeProxies subscription
              quantity and returns the number upstream — so it lives on
              dash.tubeproxies.com for the same reason purchase does (Stripe +
              provider credentials must not ship in a desktop app).

              The old item filtered the row out of local React state and
              toasted "Number released" while releasing nothing: the number
              stayed on the subscription and reappeared on the next refresh,
              having told the user it was gone. Use "Manage numbers" in the
              page header for real quantity changes.
            */}
          </div>
        </div>
      )}
    </div>
  )
}

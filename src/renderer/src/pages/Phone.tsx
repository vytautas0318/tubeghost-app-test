import { Button, listPhoneLinks } from '@tubeghost/ui'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ExternalLink,
  ChevronRight,
  Users,
  AlertTriangle,
  RefreshCw,
  CreditCard
} from 'lucide-react'
import { ToastView, useToast } from '@/components/Toast'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import {
  getPhoneOverview,
  openPhonePurchase,
  type PhoneOverview,
  type PhoneNumberRow
} from '@/lib/phoneNumbers'
import { type PhoneNum, type ProfileOpt, type Sms } from './phone/phoneData'
import { NumbersPanel } from './phone/NumbersPanel'
import { PhonePricing } from './phone/PhonePricing'
import { openAddonPortal } from './phone/phoneCheckout'
import { PhoneChangeConfirmModal } from './phone/PhoneChangeConfirmModal'
import { usePhoneQuantityChange } from './phone/usePhoneQuantityChange'
import { RecentSms } from './phone/RecentSms'
import { listProfiles } from '@/lib/profiles'
import { useWorkspace } from '@/store/workspace'

// These are TubeProxies' own phone numbers, shown read-only — the same rows
// the TubeProxies dashboard renders, read live from public.phone_numbers via
// the `phone-numbers` Edge Function (the number column is encrypted at rest,
// so the decrypt has to happen server-side).
//
// Purchase, quantity change and cancellation stay on dash.tubeproxies.com:
// they need Stripe and upstream-provider credentials, which must not ship in
// a desktop app. See docs/architecture-decision.md.

function rowToPhoneNum(r: PhoneNumberRow): PhoneNum {
  // Null number = decryption failed (wrong PHONE_DATA_ENCRYPTION_KEY). Show a
  // placeholder rather than an empty cell so the cause is visible.
  const display = r.phone_number ?? '•••• unavailable'
  const digits = display.replace(/\D/g, '')
  return {
    id: r.id,
    number: display,
    area: digits.length >= 4 ? digits.slice(1, 4) : '',
    profile: 'Unassigned',
    pl: null,
    code: null,
    from: null,
    tags: r.label ? ([['neutral', r.label]] as PhoneNum['tags']) : undefined
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function Phone(): React.ReactElement {
  const [data, setData] = useState<PhoneOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast, show } = useToast()

  // `showSpinner=false` is the poll path: refresh data silently (no loading
  // flicker, errors swallowed) so a transient network blip doesn't replace the
  // inbox with an error banner mid-session.
  const ws = useWorkspace((s) => s.current)
  const workspaceId = ws?.workspace_id ?? null

  const load = useCallback(
    async (showSpinner = true): Promise<void> => {
      if (showSpinner) setLoading(true)
      try {
        // Pass the active workspace so a member with phone_numbers.view sees the
        // owner's numbers; switching workspace re-runs this via the dep below.
        const next = await getPhoneOverview(workspaceId)
        setData(next)
        setError(null)
      } catch (e) {
        if (showSpinner) setError((e as Error).message)
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [workspaceId]
  )

  useEffect(() => {
    void load()
  }, [load])

  // Workspace profiles, for the "Assign profile" dropdown. `pl` stays null:
  // Platform here means a SOCIAL platform (yt/ig/tt…), which a browser profile
  // has no equivalent of — the icon is simply omitted.
  const [profileOpts, setProfileOpts] = useState<ProfileOpt[]>([])
  // phone_number_id → profile_id, hydrated from ghost.phone_number_links.
  const [links, setLinks] = useState<Map<string, string>>(new Map())

  const loadLinks = useCallback(async (): Promise<void> => {
    if (!workspaceId) return
    const [profiles, linkMap] = await Promise.all([
      listProfiles(workspaceId).catch(() => []),
      listPhoneLinks(workspaceId)
    ])
    setProfileOpts(profiles.map((p) => ({ id: p.id, name: p.name, pl: null })))
    setLinks(linkMap)
  }, [workspaceId])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  // Purchases and cancellations happen in the BROWSER (Stripe checkout and the
  // billing portal), which never notify the app. Re-read on focus so coming
  // back always shows current state instead of a stale table.
  useEffect(() => {
    const onFocus = (): void => void load(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const sub = data?.subscription ?? null

  // In-app quantity/cycle change (preview -> confirm -> commit) against the
  // phone-checkout edge function. OFF by default: the dashboard portal stays
  // the shipped path until this is verified in Stripe test mode.
  // Flip with VITE_INAPP_PLAN_CHANGE=1 (shared with the proxy flow).
  const inAppPlanChange = import.meta.env.VITE_INAPP_PLAN_CHANGE === '1'
  const qtyChange = usePhoneQuantityChange({
    onDone: (msg) => {
      show('success', msg)
      void load()
    },
    onNeedsPayment: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onToast: show
  })
  const numbers = data?.phone_numbers ?? []

  // Make the "Live" inbox honest: while an active subscription is on screen,
  // silently re-fetch the overview so new verification codes appear on their
  // own — no Refresh click. A client realtime subscription on public.phone_sms
  // isn't viable (the rows are encrypted + under TubeProxies' own RLS, so they
  // only come back decrypted through the service-role `phone-numbers` edge
  // function), so we poll that same cheap call. The poll pauses when the window
  // is hidden and only runs when there's a subscription that could receive SMS.
  const canReceiveSms = sub?.status === 'active'
  useEffect(() => {
    if (!canReceiveSms) return
    const POLL_MS = 15_000
    let timer: number | undefined
    const tick = (): void => {
      if (document.visibilityState === 'visible') void load(false)
      timer = window.setTimeout(tick, POLL_MS)
    }
    timer = window.setTimeout(tick, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [canReceiveSms, load])
  // Server-derived rows: each number plus the display name of the profile its
  // stored link points at. Derived during render (not via setState-in-effect,
  // which triggers a cascading re-render).
  const serverNums = React.useMemo(() => {
    const byId = new Map(profileOpts.map((p) => [p.id, p.name]))
    return numbers.map((r) => {
      const base = rowToPhoneNum(r)
      const profileId = links.get(r.id)
      const name = profileId ? byId.get(profileId) : undefined
      return name ? { ...base, profile: name } : base
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, links, profileOpts])

  // Local overlay so NumbersPanel's optimistic edits (assign/unassign, tags)
  // render immediately. The overlay is tagged with the server view it was based
  // on; when the server view changes it is discarded during render (React's
  // "adjust state while rendering" pattern) rather than in an effect, which
  // would cost an extra render pass.
  const [local, setLocal] = useState<{ base: PhoneNum[]; rows: PhoneNum[] } | null>(null)
  const overlay = local && local.base === serverNums ? local.rows : null
  const nums = overlay ?? serverNums
  // Before any numbers are owned, the page IS the price list — an empty table
  // tells the user nothing about what this costs. Gated on !loading so the
  // ladder doesn't flash before the real numbers arrive.
  const showPricingOnly = !loading && nums.length === 0

  /**
   * Stripe's billing portal, scoped to proxy + number subscriptions. Minted per
   * click — the URL is a short-lived single-use bearer link, so it must never
   * be cached.
   */
  const openPortal = (): void => {
    void openAddonPortal(workspaceId).catch((e: Error) => show('error', e.message))
  }

  // The sidebar's buy shortcut arrives as ?buy=1. Wait for the load to finish:
  // the pricing block doesn't exist until then, so scrolling any earlier finds
  // nothing. When the user owns no numbers the whole page is already the price
  // list, so there is nothing to scroll past.
  const pricingRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const wantsBuy = params.get('buy') === '1'
  useEffect(() => {
    if (!wantsBuy || loading || showPricingOnly) return
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Clear the flag so a later re-render (or a back-nav) doesn't scroll again
    // and steal the user's position while they're reading the table.
    setParams({}, { replace: true })
  }, [wantsBuy, loading, showPricingOnly, setParams])
  const setNums: React.Dispatch<React.SetStateAction<PhoneNum[]>> = (update) =>
    setLocal((cur) => {
      const from = cur && cur.base === serverNums ? cur.rows : serverNums
      return { base: serverNums, rows: typeof update === 'function' ? update(from) : update }
    })

  const activeCount = numbers.filter((n) => n.status === 'active').length
  const quantity = sub?.number_quantity ?? 0

  const inbox: Sms[] = (data?.sms ?? []).map((s) => ({
    id: s.id,
    from: s.from_number ?? 'Unknown',
    body: s.body,
    code: s.parsed_code ?? '',
    time: new Date(s.received_at).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }),
    // These numbers are sold for Google/YouTube verification, so the inbox
    // badge is always YouTube. The SMS rows carry no platform of their own.
    pl: 'yt'
  }))

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Google/YouTube US phone numbers</h1>
            <p style={{ maxWidth: '560px' }}>
              Real US non-VoIP numbers you own as long as you&apos;re subscribed — for ongoing 2FA
              and account recovery on YouTube, Gmail, and any service that needs a number.
            </p>
          </div>
          <div className="phead-actions">
            <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void load()}>
              Refresh
            </Button>
            {/* Always shown, not gated on `sub`: a purchase that paid but did
                not provision leaves the app with no subscription to detect, and
                hiding this button is exactly when the user most needs it. The
                portal reads Stripe directly, so it finds those too. */}
            <Button variant="ghost" icon={<CreditCard size={15} />} onClick={openPortal}>
              Manage subscription
            </Button>
            {/* No buy CTA before there is a subscription: the price ladder is
                already the body of this page, so a header button would just
                point at what the user is looking at. Once subscribed, changing
                the plan happens on TubeProxies, so that button stays. */}
            {sub && (
              <Button
                variant="primary"
                icon={<ExternalLink size={15} />}
                onClick={openPhonePurchase}
              >
                Manage numbers
              </Button>
            )}
          </div>
        </div>

        {data?.is_past_due && (
          <div className="phone-team" style={{ marginBottom: 16 }}>
            <span className="pt-ic">
              <AlertTriangle size={18} />
            </span>
            <div className="pt-info">
              <div className="pt-title">Payment past due</div>
              <div className="pt-sub">
                New verification codes are hidden until the card is updated. Codes received before
                the failure are still visible.
              </div>
            </div>
            <span className="pt-link" onClick={openPhonePurchase}>
              Update payment <ChevronRight size={14} />
            </span>
          </div>
        )}

        {sub?.scheduled_downgrade && (
          <div className="phone-team" style={{ marginBottom: 16 }}>
            <span className="pt-ic">
              <AlertTriangle size={18} />
            </span>
            <div className="pt-info">
              <div className="pt-title">Scheduled downgrade</div>
              <div className="pt-sub">
                Your plan changes to {sub.scheduled_downgrade.quantity ?? '—'} number(s) on{' '}
                {fmtDate(sub.scheduled_downgrade.effective_at)}.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="phone-team" style={{ marginBottom: 16 }}>
            <span className="pt-ic">
              <AlertTriangle size={18} />
            </span>
            <div className="pt-info">
              <div className="pt-title">Couldn&apos;t load phone numbers</div>
              <div className="pt-sub">{error}</div>
            </div>
            <span className="pt-link" onClick={() => void load()}>
              Retry <ChevronRight size={14} />
            </span>
          </div>
        )}

        {showPricingOnly ? (
          <PhonePricing onError={(m) => show('error', m)} />
        ) : (
          <>
            <div className="phone-summary">
              <div className="ps-stat">
                <div className="ps-k">Usage</div>
                <div className="ps-v">
                  {activeCount}
                  <span className="ps-cap"> / {quantity} active</span>
                </div>
              </div>
              <div className="ps-div" />
              <div className="ps-stat">
                <div className="ps-k">{sub?.cancel_at_period_end ? 'Ends on' : 'Next renewal'}</div>
                <div className="ps-v">
                  {loading ? '…' : sub ? fmtDate(sub.current_period_end) : 'No subscription'}
                </div>
              </div>
              <div className="ps-div" />
              <div className="ps-stat">
                <div className="ps-k">Status</div>
                <div className="ps-v" style={{ textTransform: 'capitalize' }}>
                  {sub ? sub.status.replace(/_/g, ' ') : '—'}
                </div>
              </div>
              <PoweredByTubeProxies style={{ marginLeft: 'auto' }} />
            </div>

            <div className="phone-grid">
              <NumbersPanel
                nums={nums}
                setNums={setNums}
                profileOpts={profileOpts}
                workspaceId={workspaceId}
                onLinksChanged={loadLinks}
                show={show}
              />
              <RecentSms
                inbox={inbox}
                live={canReceiveSms}
                onCopied={(val) => show('success', `Copied ${val}`)}
              />
            </div>

            {sub && !data?.is_owner && (
              <div className="phone-team">
                <span className="pt-ic">
                  <Users size={18} />
                </span>
                <div className="pt-info">
                  <div className="pt-title">Shared with you</div>
                  <div className="pt-sub">
                    These numbers belong to your team&apos;s billing owner.
                  </div>
                </div>
              </div>
            )}

            {/* Buy-more, per Julian: once numbers exist the list comes first,
            but the prices stay one scroll away rather than behind a link. */}
            <div className="pp-more-head" ref={pricingRef}>
              <h2>Add more numbers</h2>
              <p>Volume pricing — the more you hold, the less each one costs.</p>
            </div>
            <PhonePricing
              compact
              onError={(m) => show('error', m)}
              subscription={sub}
              onChangePlan={inAppPlanChange ? qtyChange.open : undefined}
            />
          </>
        )}
      </div>
      {qtyChange.target && (
        <PhoneChangeConfirmModal
          quantity={qtyChange.target.quantity}
          cycle={qtyChange.target.period}
          preview={qtyChange.preview}
          loading={qtyChange.previewLoading}
          working={qtyChange.committing}
          error={qtyChange.error}
          onCancel={qtyChange.cancel}
          onConfirm={qtyChange.confirm}
        />
      )}
      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}

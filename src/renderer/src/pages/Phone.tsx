import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, ChevronRight, Users } from 'lucide-react'
import { Button } from '@/components/ui'
import { ToastView, useToast } from '@/components/Toast'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { listProfiles } from '@/lib/profiles'
import {
  getPhoneOverview,
  openPhonePurchase,
  type PhoneNumberRow,
  type PhoneOverview,
  type PhoneSmsRow
} from '@/lib/phone-numbers'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { type PhoneNum, type Sms, type ProfileOpt } from './phone/phoneData'
import { NumbersPanel } from './phone/NumbersPanel'
import { RecentSms } from './phone/RecentSms'
import { PhonePricing } from './phone/PhonePricing'
import { PHONE_TEAM_SHARING_MIN } from '@shared/phone-plans'

// Derive a display area label from the number's country/area code (best-effort;
// US +1 numbers show their 3-digit area code).
function areaOf(number: string): string {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  if (digits.length === 10) return digits.slice(0, 3)
  return 'US'
}

// Map a TubeProxies-provisioned number to the page's PhoneNum view model.
// `phone_number` is null while the number is still provisioning upstream.
function rowToPhoneNum(r: PhoneNumberRow): PhoneNum {
  const number = r.phone_number ?? 'Provisioning…'
  return {
    id: r.id,
    number,
    area: r.phone_number ? areaOf(r.phone_number) : '—',
    profile: 'Unassigned',
    pl: null,
    code: null,
    from: null,
    tags: r.label ? [['neutral', r.label]] : undefined
  }
}

// Map a received SMS to the inbox view model. `parsed_code` is withheld
// (locked) when the phone subscription is past due — show a placeholder
// rather than an empty cell so the reason is visible.
//
// `numberById` resolves phone_number_id to the recipient number so the card
// can say WHICH of your numbers got the code — with several numbers on one
// subscription the sender shortcode alone doesn't tell you. A miss means the
// number was released or expired (the overview only returns active ones)
// while its messages are still inside the 30-day window.
function smsToView(m: PhoneSmsRow, numberById: Map<string, string>): Sms {
  return {
    id: m.id,
    to: numberById.get(m.phone_number_id) ?? 'Released number',
    from: m.from_number ?? 'Unknown',
    body: m.body,
    code: m.locked ? '•••••' : (m.parsed_code ?? ''),
    time: new Date(m.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    pl: 'yt'
  }
}

export function Phone(): React.ReactElement {
  // Numbers, SMS and the subscription all come from TubeProxies'
  // public.phone_numbers / phone_sms / phone_subscriptions via the
  // `phone-numbers` Edge Function. READ-ONLY here — buying and cancelling
  // happen on dash.tubeproxies.com. The old user-typed store
  // (ghost.user_phone_numbers) was dropped in the DB consolidation.
  const [overview, setOverview] = useState<PhoneOverview | null>(null)
  const [nums, setNums] = useState<PhoneNum[]>([])
  // Distinguishes "no numbers" from "not loaded yet" — without it the page
  // flashes the price ladder for a moment on every visit, including for
  // customers who already have numbers.
  const [loaded, setLoaded] = useState(false)
  const [profileOpts, setProfileOpts] = useState<ProfileOpt[]>([])
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const user = useAuth((s) => s.user)
  const { toast, show } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pricingRef = useRef<HTMLDivElement>(null)

  // Load the caller's phone overview. Re-runs when the signed-in user changes.
  useEffect(() => {
    let cancelled = false
    getPhoneOverview()
      .then((o) => {
        if (cancelled) return
        setOverview(o)
        setNums(o.phone_numbers.map(rowToPhoneNum))
      })
      .catch(() => {
        if (cancelled) return
        setOverview(null)
        setNums([])
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
      // Signed-in user changed: the previous user's numbers are no longer
      // valid, so drop back to the loading state rather than showing them
      // (or flashing pricing) until the new overview arrives.
      setLoaded(false)
    }
  }, [user?.id])

  // The sidebar's buy shortcut arrives as ?buy=1. Wait for `loaded` — the
  // pricing block doesn't exist until the overview resolves, so scrolling
  // any earlier finds nothing to scroll to. When the user has no numbers the
  // whole page is already the price list, so there's nothing to scroll past.
  const wantsBuy = searchParams.get('buy') === '1'
  useEffect(() => {
    if (!wantsBuy || !loaded) return
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [wantsBuy, loaded])

  // Real workspace profiles for the "Assign to profile" popover.
  useEffect(() => {
    if (!workspaceId) return
    listProfiles(workspaceId)
      .then((rows) => setProfileOpts(rows.map((r) => ({ name: r.name, pl: null }))))
      .catch(() => setProfileOpts([]))
  }, [workspaceId])

  // Before any numbers are owned, the page IS the price list — an empty
  // table tells the user nothing about what this costs.
  const showPricingOnly = loaded && nums.length === 0
  const active = nums.filter((n) => n.profile !== 'Unassigned').length
  // 7, per TubeProxies' enforce_phone_team_seat_limit — the previous 5 here
  // promised unlock at a quantity their backend still rejects.
  const teamGap = Math.max(0, PHONE_TEAM_SHARING_MIN - nums.length)
  const sub = overview?.subscription ?? null
  const numberById = new Map(
    (overview?.phone_numbers ?? [])
      .filter((r) => r.phone_number)
      .map((r) => [r.id, r.phone_number as string])
  )
  const inbox = (overview?.sms ?? []).map((m) => smsToView(m, numberById))
  const renewal = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : 'No subscription'

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
            {/* Commerce lives on the TubeProxies dashboard — deep-link out
                rather than reimplementing Stripe here. */}
            <Button
              variant="primary"
              icon={<ExternalLink size={15} />}
              onClick={openPhonePurchase}
            >
              {nums.length > 0 ? 'Manage numbers' : 'Get numbers'}
            </Button>
          </div>
        </div>

        {showPricingOnly ? (
          <PhonePricing />
        ) : (
          <>
        <div className="phone-summary">
          <div className="ps-stat">
            <div className="ps-k">Usage</div>
            <div className="ps-v">
              {active}
              <span className="ps-cap"> / {nums.length} active</span>
            </div>
          </div>
          <div className="ps-div" />
          <div className="ps-stat">
            <div className="ps-k">Next renewal</div>
            <div className="ps-v">{renewal}</div>
          </div>
          <div className="ps-div" />
          <div className="ps-stat">
            <div className="ps-k">Monthly cost</div>
            <div className="ps-v">
              $0.00<span className="ps-cap"> /mo</span>
            </div>
          </div>
          <PoweredByTubeProxies style={{ marginLeft: 'auto' }} />
        </div>

        <div className="phone-grid">
          <NumbersPanel nums={nums} setNums={setNums} profileOpts={profileOpts} show={show} />
          <RecentSms inbox={inbox} onCopied={(val) => show('success', `Copied ${val}`)} />
        </div>

        <div className="phone-team">
          <span className="pt-ic">
            <Users size={18} />
          </span>
          <div className="pt-info">
            <div className="pt-title">Team sharing {teamGap > 0 ? '— locked' : '— unlocked'}</div>
            <div className="pt-sub">
              {teamGap > 0
                ? `Add ${teamGap} more numbers (${PHONE_TEAM_SHARING_MIN}+ total) to unlock team sharing.`
                : 'Your team can share these numbers for verification.'}
            </div>
          </div>
          <span className="pt-link" onClick={() => navigate('/team/members')}>
            Manage on Members <ChevronRight size={14} />
          </span>
        </div>

        {/* Buy-more, per Julian: once numbers exist the list comes first,
            but the prices stay one scroll away rather than behind a link. */}
        <div className="pp-more-head" ref={pricingRef}>
          <h2>Add more numbers</h2>
          <p>Volume pricing — the more you hold, the less each one costs.</p>
        </div>
        <PhonePricing compact />
          </>
        )}
      </div>
      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}

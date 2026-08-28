import * as React from 'react'
import { Download, Copy, CreditCard, User } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { Button, Badge, MetricCard, type BadgeTone } from '@tubeghost/ui'
import { ToastView, useToast } from '@/components/Toast'

// Referral figures below are the design's sample data — the partner/affiliate
// backend isn't built yet, so this is a visual page. The referral link + payout
// email are derived from the real workspace/user.
type RefStatus = 'paid' | 'trial' | 'signup'
const REFERRALS: { id: string; plan: string; status: RefStatus; earn: string; since: string }[] = [
  { id: 'R-8842', plan: 'Enterprise', status: 'paid', earn: '$99.80/mo', since: 'Mar 2026' },
  { id: 'R-8843', plan: 'Pro', status: 'paid', earn: '$29.80/mo', since: 'Apr 2026' },
  { id: 'R-8847', plan: 'Pro', status: 'paid', earn: '$29.80/mo', since: 'May 2026' },
  { id: 'R-8851', plan: 'Trial', status: 'trial', earn: '—', since: 'Jun 2026' },
  { id: 'R-8856', plan: 'No plan', status: 'signup', earn: '—', since: 'Jun 2026' }
]
const STATUS: Record<RefStatus, [BadgeTone, string]> = {
  paid: ['green', 'Earning'],
  trial: ['amber', 'On trial'],
  signup: ['neutral', 'No plan yet']
}

const dollar = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
)
const trend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M23 6l-9.5 9.5-5-5L1 18" />
    <path d="M17 6h6v6" />
  </svg>
)
const users = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
  </svg>
)
const gift = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
  </svg>
)

export function Partner(): React.ReactElement {
  const email = useAuth((s) => s.user?.email) ?? 'you@company.com'
  const workspace = useWorkspace((s) => s.current)
  const slug =
    workspace?.workspace_name
      ?.split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'workspace'
  const link = `tubeghost.com/r/${slug}`
  const { toast, show } = useToast()

  const copy = (): void => {
    try {
      void navigator.clipboard?.writeText(`https://${link}`)
    } catch {
      /* ignore */
    }
    show('info', 'Referral link copied')
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Partner program</h1>
            <p>Earn 20% recurring commission on every paying customer you refer</p>
          </div>
          <div className="phead-actions">
            <Button icon={<Download size={15} />} onClick={() => show('info', 'Payout history — coming soon')}>
              Payout history
            </Button>
            <Button
              variant="primary"
              icon={<Download size={15} />}
              onClick={() => show('info', 'Request payout — coming soon')}
            >
              Request payout
            </Button>
          </div>
        </div>

        <div className="cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <MetricCard icon={dollar} tone="green" value="$159" unit="/mo" label="Recurring commission" delta="2" />
          <MetricCard icon={trend} tone="red" value="$868" label="Earned all-time" />
          <MetricCard icon={users} tone="blue" value="3" label="Paying customers" />
          <MetricCard icon={gift} tone="violet" value="5" label="Total referrals" />
        </div>

        <div className="partner-grid">
          <div className="sec ref-link-sec">
            <div className="sec-t">Your referral link</div>
            <div className="sec-s">
              Commission is paid only once a referral becomes a <b>paying</b> customer — trials and
              free signups don&apos;t earn until they upgrade.
            </div>
            <div className="ref-link">
              <span className="ref-link-url">{link}</span>
              <Button size="sm" icon={<Copy size={13} />} onClick={copy}>
                Copy
              </Button>
            </div>
            <div className="ref-terms">
              <div className="ref-term">
                <span className="ref-term-n">20%</span>
                <span className="ref-term-l">Recurring share of every paid invoice</span>
              </div>
              <div className="ref-term">
                <span className="ref-term-n">60 days</span>
                <span className="ref-term-l">Cookie window to attribute a signup</span>
              </div>
              <div className="ref-term">
                <span className="ref-term-n">$100</span>
                <span className="ref-term-l">Minimum balance to request a payout</span>
              </div>
            </div>
          </div>

          <div className="sec payout-sec">
            <div className="sec-t" style={{ marginBottom: '4px' }}>
              Next payout
            </div>
            <div className="payout-amt">$159.40</div>
            <div className="payout-sub">Scheduled Jul 1, 2026</div>
            <div className="payout-bar-wrap">
              <div className="payout-bar">
                <i style={{ width: '76%' }} />
              </div>
              <div className="payout-hint">$159 of $100 minimum reached</div>
            </div>
            <div className="payout-method">
              <span className="payout-method-ic">
                <CreditCard size={16} />
              </span>
              <div>
                <div className="payout-method-n">PayPal</div>
                <div className="payout-method-v">{email}</div>
              </div>
              <Button
                size="sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => show('info', 'Change payout method — coming soon')}
              >
                Change
              </Button>
            </div>
          </div>
        </div>

        <div className="sec" style={{ marginTop: '16px' }}>
          <div className="sec-row">
            <div>
              <div className="sec-t">Referrals</div>
              <div className="sec-s">
                For privacy, referred customers stay anonymous — you see plan tier and commission,
                never who they are.
              </div>
            </div>
          </div>
          <div className="ref-table">
            <div className="ref-head">
              <div className="th">Referral</div>
              <div className="th">Plan</div>
              <div className="th">Status</div>
              <div className="th">Your commission</div>
              <div className="th">Referred</div>
            </div>
            {REFERRALS.map((r) => {
              const [tone, label] = STATUS[r.status]
              return (
                <div className="ref-row" key={r.id}>
                  <div className="ref-cust">
                    <span className="ref-anon-ic">
                      <User size={14} />
                    </span>
                    <span className="ref-name" style={{ fontFamily: 'var(--mono)' }}>
                      {r.id}
                    </span>
                  </div>
                  <div className="ref-plan">{r.plan}</div>
                  <div>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <div className={'ref-earn' + (r.status === 'paid' ? ' on' : '')}>{r.earn}</div>
                  <div className="ref-since">{r.since}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <ToastView toast={toast} />
    </div>
  )
}

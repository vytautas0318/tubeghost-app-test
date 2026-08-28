import * as React from 'react'
import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { ToastView, useToast } from '@/components/Toast'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { Flag } from '@/components/Flag'
import { PlanChangeConfirmModal } from './buy-proxies/PlanChangeConfirmModal'
import { usePlanChange } from './buy-proxies/usePlanChange'
import {
  CheckoutRefused,
  checkoutUrl,
  getProxyPlanStatus,
  startProxyCheckout,
  type ProxyCycle,
  type ProxyPlanStatus
} from './buy-proxies/checkoutLink'
import { ADDON_CYCLE_MULT } from '@shared/pricing'
import { PROXY_TERMS, TIERS, periodsFor } from './buy-proxies/tiers'

export function BuyProxies({
  embedded = false
}: {
  /**
   * Render just the ladder, for embedding as the Proxies page's empty state.
   * Drops the page heading and the outer scroll wrapper — the host page
   * already provides both — but keeps the type bar, term toggle and cards, so
   * there is ONE definition of what a proxy pack costs.
   */
  embedded?: boolean
} = {}): React.ReactElement {
  const [term, setTerm] = useState<ProxyCycle>('quarterly')
  const [busy, setBusy] = useState<string | null>(null)
  // Current subscription + stock, so each card can show "Current plan",
  // "Out of stock" or Upgrade/Downgrade instead of a uniform "Buy now".
  const [status, setStatus] = useState<ProxyPlanStatus | null>(null)
  // Distinct from `status === null`, which is also the "failed to load" state.
  // Without this the cards render a full set of "Buy now" buttons and then some
  // flip to "Current plan" / "Out of stock" once the fetch lands — a visible
  // flash of wrong, clickable state on a page that takes money.
  const [statusLoading, setStatusLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void getProxyPlanStatus()
      .then((s) => !cancelled && setStatus(s))
      .finally(() => !cancelled && setStatusLoading(false))
    return () => {
      cancelled = true
    }
  }, [])
  const currentTier = TIERS.find((t) => t.name === status?.current_plan) ?? null
  const { toast, show } = useToast()

  // Create a Stripe Checkout session for the clicked plan and open it. On any
  // failure fall back to the dashboard's plan-preselected billing page so the
  // user can still buy rather than hitting a dead button.
  // Changing an EXISTING subscription (different pack, or the same pack on a
  // different billing term) is not a checkout: it is a Stripe subscription
  // update that must prorate, and a downgrade must take effect at the end of
  // the current period rather than immediately.
  //
  // The dashboard already implements all of that (/api/upgrade handles interval
  // changes explicitly; /api/downgrade schedules the change for period end), and
  // proxies-checkout deliberately REFUSES a second subscription for exactly this
  // reason -- "Creating another here would bill twice". So we hand off with the
  // plan and term preselected rather than build a second proration path against
  // the same Stripe account.
  const planChange = usePlanChange({
    term,
    onDone: (msg) => {
      show('success', msg)
      // Re-read so the cards reflect the new plan/cycle immediately.
      void getProxyPlanStatus().then(setStatus)
    },
    onNeedsPayment: (url) => window.open(url, '_blank', 'noopener'),
    onToast: show
  })

  // Changing an existing subscription happens IN-APP: preview -> confirm ->
  // commit against the proxies-checkout edge function, which prorates upgrades
  // immediately and schedules downgrades for the end of the period. The old
  // hand-off to the TubeProxies dashboard is gone.
  //
  // One case still leaves the app: a TIER downgrade must name which proxies to
  // release, and that picker is not built here — usePlanChange refuses it with
  // a message pointing at the dashboard rather than sending a list the server
  // would reject.
  const onChangePlan = (planName: string): void => {
    planChange.open(planName)
  }

  const onBuy = async (planName: string): Promise<void> => {
    if (busy) return
    setBusy(planName)
    try {
      window.open(await startProxyCheckout(planName, term), '_blank', 'noopener')
    } catch (e) {
      // A refusal is the user's answer — show it. Falling back to the dashboard
      // here would just repeat the same rejection one page later.
      if (e instanceof CheckoutRefused) {
        show('error', e.message)
      } else {
        console.warn('[buy-proxies] checkout failed, falling back:', (e as Error).message)
        show('info', 'Opening checkout on the TubeProxies dashboard…')
        window.open(checkoutUrl(planName, term), '_blank', 'noopener')
      }
    } finally {
      setBusy(null)
    }
  }
  const mult = ADDON_CYCLE_MULT[term]
  // What Stripe charges per period, for the "Billed ... at" line.
  const periods = periodsFor(term)
  const fmt = (n: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const Shell = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    embedded ? (
      <div className="buy-embedded">{children}</div>
    ) : (
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="wrap">{children}</div>
      </div>
    )

  return (
    <Shell>
      {!embedded && (
        <div className="phead">
          <div>
            <h1>Buy proxies</h1>
            <p>US static residential IPs — provisioned straight into your pool</p>
          </div>
          <PoweredByTubeProxies />
        </div>
      )}

      <div className="buy-typebar">
        <span className="buy-flag" role="img" aria-label="United States">
          <Flag code={'US'} />
        </span>
        <div>
          <div className="buy-typebar-n">United States · Static Residential</div>
          <div className="buy-typebar-d">
            Same IP every session · zero fraud score · timezone-matched
          </div>
        </div>
        <span className="buy-only">Only type available</span>
      </div>

      <div className="buy-toggle-row">
        {/* Monthly -> Quarterly -> Annual, matching dash.tubeproxies.com and
              every other pricing surface. Annual was missing entirely even
              though all six packs have an annual price. */}
        <div className="buy-toggle">
          {PROXY_TERMS.map(([id, label, off]) => (
            <button
              key={id}
              className={'bt-opt' + (term === id ? ' on' : '')}
              onClick={() => setTerm(id)}
            >
              {label}
              {off && <span className="bt-off">{off}</span>}
            </button>
          ))}
        </div>
      </div>

      {statusLoading && <div className="tpp-sub-banner tpp-sub-skeleton" aria-hidden />}

      {!statusLoading && status?.test_mode && (
        <div className="tpp-sub-banner" style={{ borderColor: 'var(--amber)' }}>
          <b>Stripe test mode</b>
          <span>
            No real payment is taken. Use card <b>4242 4242 4242 4242</b>, any future expiry and any
            CVC.
          </span>
        </div>
      )}

      {!statusLoading && status?.current_plan && (
        <div className="tpp-sub-banner">
          <Check size={14} />
          <span>
            You&apos;re on <b>{status.current_plan}</b>
            {status.proxy_limit != null && ` · ${status.proxy_limit} IPs`}
            {status.status === 'past_due' && ' · payment past due'}
            {status.renews_at && ` · renews ${new Date(status.renews_at).toLocaleDateString()}`}.
            Changing plan prorates on the TubeProxies dashboard.
          </span>
        </div>
      )}

      <div className="tpp-grid cols-3">
        {TIERS.map((t) => {
          const perIp = t.perIp * mult
          const monthly = perIp * t.ips
          // Versus the same pack at full monthly list — the dashboard's
          // "Save $X per quarter/year" line.
          const saving = t.perIp * t.ips * periods - monthly * periods
          return (
            <div key={t.id} className={'tpp-card' + (t.feat ? ' feat' : '')}>
              {t.feat && <div className="tpp-best">Best value</div>}
              <div className="tpp-name">{t.name}</div>
              <div className="tpp-desc">{t.desc}</div>
              <div className="tpp-ips">
                {t.ips} IP{t.ips > 1 ? 's' : ''}
              </div>
              {/* Headline is the PACK's monthly cost, as on the dashboard.
                    It used to show the per-IP rate, which reads far cheaper
                    than the card actually costs. */}
              <div className="tpp-price">
                ${fmt(monthly)}
                <span className="per">/mo</span>
              </div>
              {term !== 'monthly' && (
                <div className="tpp-sub">
                  Billed {term === 'annual' ? 'annually' : 'quarterly'} at ${fmt(monthly * periods)}
                </div>
              )}
              {saving > 0 && (
                <div className="tpp-save">
                  Save ${fmt(saving)} per {term === 'annual' ? 'year' : 'quarter'}
                </div>
              )}
              {(() => {
                const samePlan = status?.current_plan === t.name
                // "Current plan" only when the CYCLE matches too. Comparing the
                // name alone marked Hobby as current on every cycle tab, so a
                // monthly subscriber could never switch to quarterly.
                // current_cycle null = unknown (older server): fall back to the
                // old name-only behaviour rather than offering a switch we
                // can't confirm is a switch.
                const isCurrent =
                  samePlan && (status?.current_cycle == null || status.current_cycle === term)
                const isCycleChange = samePlan && !isCurrent
                // Longer commitment ranks higher, so monthly -> quarterly/annual
                // is an UPGRADE (immediate, prorated) and the reverse is a
                // downgrade (scheduled at period end). Same ordering the server
                // classifier uses, so the button says what will actually happen.
                const INTERVAL_RANK = { monthly: 0, quarterly: 1, annual: 2 } as const
                const isCycleUpgrade =
                  isCycleChange &&
                  status?.current_cycle != null &&
                  INTERVAL_RANK[term] > INTERVAL_RANK[status.current_cycle]
                const isUpgradeTier = currentTier != null && t.ips > currentTier.ips
                // Stock only matters when you are claiming IPs you do not
                // already hold. A CYCLE change is the same IPs you are already
                // using, and a DOWNGRADE releases IPs rather than taking them —
                // blocking either on inventory told a paying subscriber their
                // own active plan was "Out of stock".
                // (Same reasoning as the isCurrent check above, which is
                // deliberately evaluated before this one.)
                // `samePlan` is checked independently of currentTier: a
                // subscription whose plan_name is not in the local tier list
                // (renamed pack, custom plan) leaves currentTier null, and
                // without this a cycle switch on that plan would be stock-gated
                // as if it were a first purchase.
                const needsNewStock = !samePlan && (currentTier == null || isUpgradeTier)
                // null stock = unknown (status unavailable); don't block a
                // sale on a reading we don't have.
                const outOfStock =
                  needsNewStock && status?.available != null && status.available < t.ips
                const isUpgrade = isUpgradeTier
                const isDowngrade = currentTier != null && t.ips < currentTier.ips

                if (statusLoading) {
                  // Disabled while unknown: clicking would race the state
                  // that decides whether this plan is even purchasable.
                  return (
                    <button className="tpp-buy tpp-loading" disabled>
                      Loading…
                    </button>
                  )
                }
                if (isCurrent) {
                  return <div className="tpp-buy tpp-current">Current plan</div>
                }
                // Any change to an existing subscription -- different pack OR
                // different term -- goes to the dashboard. Only a first-time
                // purchase uses in-app checkout.
                const hasSubscription = status?.current_plan != null
                return (
                  <button
                    className={'tpp-buy' + (t.feat ? ' red' : '')}
                    onClick={() => (hasSubscription ? onChangePlan(t.name) : void onBuy(t.name))}
                    disabled={busy !== null || outOfStock}
                    title={
                      outOfStock
                        ? `Only ${status?.available} IPs in stock — ${t.ips} needed`
                        : undefined
                    }
                  >
                    {busy === t.name
                      ? 'Starting checkout…'
                      : outOfStock
                        ? 'Out of stock'
                        : isCycleChange
                          ? // Same pack, different term. Lengthening the term
                            // is an upgrade (immediate + prorated); shortening
                            // is a downgrade, scheduled for period end.
                            //
                            // Both surfaces now say "Downgrade to": the dash
                            // adopted it too (commit 19:01 27-08), so the app
                            // and dashboard read identically for this action.
                            `${isCycleUpgrade ? 'Upgrade to' : 'Downgrade to'} ${term === 'annual' ? 'annual' : term === 'quarterly' ? 'quarterly' : 'monthly'}`
                          : isUpgrade
                            ? 'Upgrade'
                            : isDowngrade
                              ? 'Downgrade'
                              : 'Buy now'}
                  </button>
                )
              })()}
              <div className="tpp-cancel">Cancel anytime</div>
              <div className="tpp-feats">
                <div className={'tpp-feat' + (t.members ? ' yes' : ' no')}>
                  {t.members ? <Check size={14} /> : <X size={14} />}
                  {t.members ? `${t.members} team members` : 'No team members'}
                </div>
                <div className={'tpp-feat' + (t.members ? ' yes' : ' no')}>
                  {t.members ? <Check size={14} /> : <X size={14} />}
                  {t.members ? 'Role-based access' : 'No role-based access'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="buy-foot">
        <div className="buy-foot-feat">
          <Check size={14} />
          Instantly added to your proxy pool
        </div>
        <div className="buy-foot-feat">
          <Check size={14} />
          Zero fraud score, tested on delivery
        </div>
        <div className="buy-foot-feat">
          <Check size={14} />
          Auto-matched timezone &amp; locale
        </div>
        <div className="buy-foot-help">
          Need more than 100 IPs?{' '}
          <span className="bs-link" onClick={() => show('info', 'Contacting TubeProxies sales')}>
            Talk to TubeProxies sales
          </span>
        </div>
      </div>
      {/* Embedded, the host page already renders a ToastView; a second one
          would stack two toasts in the same corner. */}
      {planChange.target && (
        <PlanChangeConfirmModal
          planName={planChange.target}
          cycle={term}
          preview={planChange.preview}
          loading={planChange.previewLoading}
          working={planChange.committing}
          error={planChange.error}
          onCancel={planChange.cancel}
          onConfirm={planChange.confirm}
        />
      )}
      {!embedded && <ToastView toast={toast} position="bottom-center" />}
    </Shell>
  )
}

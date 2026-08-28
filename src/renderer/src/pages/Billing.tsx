import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '@tubeghost/ui'
import { ToastView, useToast } from '@/components/Toast'
import { useWorkspace } from '@/store/workspace'
import { useBilling } from './billing/useBilling'
import { useProxyAddons, usePhoneAddons } from './billing/useAddonData'
import { OverviewTab } from './billing/OverviewTab'
import { ProxiesTab, PhoneTab, InvoicesTab } from './billing/AddonTabs'
import { UpgradeModal } from './billing/UpgradeModal'
import { billingApi } from './billing/billingApi'
import { useCheckoutReturn, type CheckoutOutcome } from './billing/useCheckoutReturn'

const TABS: [string, string][] = [
  ['overview', 'Overview'],
  ['proxies', 'Proxies'],
  ['phone', 'Phone numbers'],
  ['invoices', 'Invoices']
]

const VALID = new Set(TABS.map(([k]) => k))

export function Billing(): React.ReactElement {
  // Tab lives in the URL (?tab=proxies) so it survives a reload.
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') ?? 'overview'
  const tab = VALID.has(raw) ? raw : 'overview'
  const setTab = (next: string): void => {
    const p = new URLSearchParams(params)
    if (next === 'overview') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const billing = useBilling()
  const proxies = useProxyAddons()
  const phones = usePhoneAddons()
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const navigate = useNavigate()
  const { toast, show } = useToast()
  const [upgrading, setUpgrading] = useState(false)

  // Stripe finishes in the system browser and deep-links back here. The
  // entitlement is written by our webhook a moment later, so poll until the
  // plan actually changes rather than showing the stale one.
  const checkoutParam = params.get('checkout')
  const outcome: CheckoutOutcome =
    checkoutParam === 'success' || checkoutParam === 'cancelled' ? checkoutParam : null
  const p = billing.plan.data
  // Changes whenever the subscription does — the signal that the webhook landed.
  const planSignature = `${p?.id ?? ''}|${p?.profileLimit ?? ''}|${p?.seats ?? ''}|${p?.cycle ?? ''}|${p?.status ?? ''}`
  const checkout = useCheckoutReturn(outcome, planSignature, billing.refresh)

  /**
   * Opens the Stripe Customer Portal. Minted per click — the URL is a
   * short-lived single-use bearer link, so it must never be cached.
   */
  const openPortal = (): void => {
    void billingApi.openPortal(workspaceId).catch((e: Error) => {
      show('error', e.message)
    })
  }

  // A plan changed in Stripe's portal writes to our DB via the webhook, but the
  // portal lives in the BROWSER — it never tells the app anything, and its
  // return_url only fires if the user happens to click "Return to ...". So
  // re-read whenever the window regains focus: coming back from the portal is
  // exactly that, and the cost is one cheap query.
  useEffect(() => {
    const onFocus = (): void => billing.refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [billing.refresh])

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Billing</h1>
            <p>Manage your subscription, usage, and payment methods</p>
          </div>
          <div className="phead-actions">
            <Button variant="primary" onClick={() => setUpgrading(true)}>
              Manage plan
            </Button>
          </div>
        </div>

        {/* Checkout returned from the system browser. "Success" is Stripe's
            word for "paid" — the plan itself lands when our webhook writes it,
            which is what `settling` is waiting on. */}
        {checkout.outcome && (
          <div className={'bill-return ' + checkout.outcome} role="status">
            <span>
              {checkout.outcome === 'cancelled'
                ? 'Checkout cancelled — nothing was charged.'
                : checkout.settling
                  ? 'Payment received — updating your plan…'
                  : 'Payment received. Your plan is up to date.'}
            </span>
            <button onClick={checkout.clear} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        <div className="ext-tabs" role="tablist" style={{ marginBottom: '22px' }}>
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={'ext-tab' + (tab === k ? ' on' : '')}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <OverviewTab
            billing={billing}
            onUpgrade={() => setUpgrading(true)}
            onManageBilling={openPortal}
            // Add / update / remove all open the same Stripe portal session —
            // one hosted page handles every card operation, plus invoices and
            // cancellation.
            onAddPayment={openPortal}
            onUpdatePayment={openPortal}
            onRemovePayment={openPortal}
            onSaveEmail={() => show('info', 'Billing email is your account email for now')}
          />
        )}
        {tab === 'proxies' && (
          <ProxiesTab proxies={proxies} onBuy={() => navigate('/buy-proxies')} />
        )}
        {tab === 'phone' && <PhoneTab phones={phones} onBuy={() => navigate('/phone')} />}
        {tab === 'invoices' && <InvoicesTab invoices={billing.invoices} />}
      </div>

      {upgrading && (
        // currentProfileCount is null when the count failed to load — the modal
        // then skips its local downgrade guard and lets billing-checkout make
        // the authoritative call.
        <UpgradeModal
          usage={billing.usage.data}
          plan={billing.plan.data}
          workspaceId={workspaceId}
          currentProfileCount={billing.usage.data.profilesUsed}
          onManageBilling={openPortal}
          onClose={() => setUpgrading(false)}
        />
      )}
      <ToastView toast={toast} />
    </div>
  )
}

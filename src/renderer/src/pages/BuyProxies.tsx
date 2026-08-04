import * as React from 'react'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { ToastView, useToast } from '@/components/Toast'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { Flag } from '@/components/Flag'

type Tier = {
  id: string
  name: string
  desc: string
  ips: number
  perIp: number
  feat?: boolean
  members?: number
}

// Monthly per-IP rate; quarterly applies a 10% discount (mult 0.9).
const TIERS: Tier[] = [
  { id: 'starter', name: 'Starter', desc: 'Perfect for testing', ips: 1, perIp: 8.0 },
  { id: 'small', name: 'Small Team', desc: 'Great for small teams', ips: 10, perIp: 7.5 },
  { id: 'growth', name: 'Growth', desc: 'Scale your operations', ips: 25, perIp: 7.0, feat: true },
  { id: 'scale', name: 'Scale', desc: 'For teams at scale', ips: 50, perIp: 6.5, members: 2 },
  {
    id: 'enterprise',
    name: 'Enterprise',
    desc: 'Maximum volume',
    ips: 100,
    perIp: 5.0,
    members: 10
  }
]

export function BuyProxies(): React.ReactElement {
  const [term, setTerm] = useState<'quarterly' | 'monthly'>('quarterly')
  const { toast, show } = useToast()
  const mult = term === 'quarterly' ? 0.9 : 1
  const fmt = (n: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Buy proxies</h1>
            <p>US static residential IPs — provisioned straight into your pool</p>
          </div>
          <PoweredByTubeProxies />
        </div>

        <div className="buy-typebar">
          <span className="buy-flag">
            <Flag code="US" size={30} title="United States" />
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
          <div className="buy-toggle">
            <button
              className={'bt-opt' + (term === 'quarterly' ? ' on' : '')}
              onClick={() => setTerm('quarterly')}
            >
              Quarterly <span className="bt-off">10% Off</span>
            </button>
            <button
              className={'bt-opt' + (term === 'monthly' ? ' on' : '')}
              onClick={() => setTerm('monthly')}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className="tpp-grid">
          {TIERS.map((t) => {
            const perIp = t.perIp * mult
            const monthly = perIp * t.ips
            return (
              <div key={t.id} className={'tpp-card' + (t.feat ? ' feat' : '')}>
                {t.feat && <div className="tpp-best">Best value</div>}
                <div className="tpp-name">{t.name}</div>
                <div className="tpp-desc">{t.desc}</div>
                <div className="tpp-ips">
                  {t.ips} IP{t.ips > 1 ? 's' : ''}
                </div>
                <div className="tpp-price">
                  ${fmt(perIp)}
                  <span className="per">/IP</span>
                </div>
                <div className="tpp-sub">
                  ${Math.round(monthly)}/month · {term === 'quarterly' ? 'Quarterly' : 'Monthly'}
                </div>
                <button
                  className={'tpp-buy' + (t.feat ? ' red' : '')}
                  onClick={() => window.open('https://dash.tubeproxies.com/billing', '_blank')}
                >
                  Buy now
                </button>
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
      </div>
      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}

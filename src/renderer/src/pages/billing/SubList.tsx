import * as React from 'react'
import { MoreVertical } from 'lucide-react'
import { Badge, Button, type BadgeTone } from '@/components/ui'

export type Sub = {
  name: string
  loc: string
  amt: string
  per: string
  renew: string
  tone: BadgeTone
  state: string
}

// Subscription add-on list (proxies / phone numbers tabs on Billing). Renders
// an empty state when there are no subscriptions — nothing is invented.
export function SubList({
  subs,
  section,
  desc,
  emptyText,
  ctaLabel,
  ctaIcon,
  onCta,
  onManage
}: {
  subs: Sub[]
  section: string
  desc: string
  emptyText: string
  ctaLabel: string
  ctaIcon: React.ReactNode
  onCta: () => void
  onManage: (name: string) => void
}): React.ReactElement {
  return (
    <div className="sec">
      <div className="sec-row">
        <div>
          <div className="sec-t">{section}</div>
          <div className="sec-s">{desc}</div>
        </div>
        <Button variant="primary" icon={ctaIcon} onClick={onCta}>
          {ctaLabel}
        </Button>
      </div>
      {subs.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--t1)' }}>
            No active subscriptions
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '4px' }}>
            {emptyText}
          </div>
        </div>
      ) : (
        <div className="px-sub-list">
          {subs.map((s) => (
            <div className="px-sub" key={s.name}>
              <span className="px-sub-flag" />
              <div className="px-sub-info">
                <div className="px-sub-name">{s.name}</div>
                <div className="px-sub-loc">{s.loc}</div>
              </div>
              <div className="px-sub-cyc">{s.renew}</div>
              <div className="px-sub-amt">
                {s.amt}
                <span>/{s.per}</span>
              </div>
              <Badge tone={s.tone}>{s.state}</Badge>
              <div className="px-sub-x" onClick={() => onManage(s.name)}>
                <MoreVertical size={16} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

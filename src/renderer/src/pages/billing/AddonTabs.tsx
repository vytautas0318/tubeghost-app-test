// Proxies / Phone numbers / Invoices billing tabs. Rates come from the shared
// pricing module at the current pool size — never a second copy of the tiers.

import * as React from 'react'
import { FileText, Globe, Smartphone, Download } from 'lucide-react'
import { Badge, Button } from '@tubeghost/ui'
import { PHONE_TIERS, PROXY_TIERS, money, rate } from '@shared/pricing'
import type { Invoice, Section } from './types'
import type { PhoneAddon, ProxyAddon } from './useAddonData'

function Shell({
  title,
  desc,
  action,
  children
}: {
  title: string
  desc: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="sec">
      <div className="sec-row">
        <div>
          <div className="sec-t">{title}</div>
          <div className="sec-s">{desc}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({
  icon,
  title,
  sub
}: {
  icon: React.ReactNode
  title: string
  sub: string
}): React.ReactElement {
  return (
    <div className="bill-empty">
      {icon}
      <div className="bill-empty-t">{title}</div>
      <div className="bill-empty-s">{sub}</div>
    </div>
  )
}

function State<T>({
  section,
  empty,
  children
}: {
  section: Section<T[]>
  empty: React.ReactNode
  children: (rows: T[]) => React.ReactNode
}): React.ReactElement {
  if (section.loading)
    return (
      <div className="bill-rows" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div className="bill-row bill-skel" key={i} />
        ))}
      </div>
    )
  if (section.error)
    return (
      <div className="bill-err-inline" role="alert">
        Couldn&apos;t load — {section.error}
      </div>
    )
  if (!section.data.length) return <>{empty}</>
  return <>{children(section.data)}</>
}

export function ProxiesTab({
  proxies,
  onBuy
}: {
  proxies: Section<ProxyAddon[]>
  onBuy: () => void
}): React.ReactElement {
  const qty = proxies.data.length
  const unit = rate(PROXY_TIERS, qty)
  return (
    <Shell
      title="Proxy add-ons"
      desc={`US static residential IPs, billed alongside your plan. ${money(unit)}/ea at ${qty} in pool.`}
      action={
        <Button variant="primary" icon={<Globe size={15} />} onClick={onBuy}>
          Buy proxies
        </Button>
      }
    >
      <State
        section={proxies}
        empty={
          <Empty
            icon={<Globe size={20} />}
            title="No proxies yet"
            sub="Proxies you buy or add appear here."
          />
        }
      >
        {(rows) => (
          <div className="bill-rows">
            <div className="bill-row bill-row-head">
              <span>Label</span>
              <span>Type</span>
              <span>Location</span>
              <span>Assigned</span>
              <span className="ta-r">Rate</span>
            </div>
            {rows.map((r) => (
              <div className="bill-row" key={r.id}>
                <span className="bill-row-name">{r.label}</span>
                <span>{r.type}</span>
                <span>{r.location}</span>
                <span>{r.assignedProfile ?? '—'}</span>
                <span className="ta-r bill-row-amt">
                  {money(unit)}
                  <em>/mo</em>
                </span>
              </div>
            ))}
          </div>
        )}
      </State>
    </Shell>
  )
}

export function PhoneTab({
  phones,
  onBuy
}: {
  phones: Section<PhoneAddon[]>
  onBuy: () => void
}): React.ReactElement {
  const qty = phones.data.length
  const unit = rate(PHONE_TIERS, qty)
  return (
    <Shell
      title="Phone numbers"
      desc={`US SMS-verification numbers, billed alongside your plan. ${money(unit)}/ea at ${qty} held.`}
      action={
        <Button variant="primary" icon={<Smartphone size={15} />} onClick={onBuy}>
          Get a number
        </Button>
      }
    >
      <State
        section={phones}
        empty={
          <Empty
            icon={<Smartphone size={20} />}
            title="No phone numbers yet"
            sub="Numbers you add appear here."
          />
        }
      >
        {(rows) => (
          <div className="bill-rows">
            <div className="bill-row bill-row-head">
              <span>Number</span>
              <span>Label</span>
              <span>Added</span>
              <span className="ta-r">Rate</span>
            </div>
            {rows.map((r) => (
              <div className="bill-row" key={r.id}>
                <span className="bill-row-name">{r.number}</span>
                <span>{r.label ?? '—'}</span>
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                <span className="ta-r bill-row-amt">
                  {money(unit)}
                  <em>/mo</em>
                </span>
              </div>
            ))}
          </div>
        )}
      </State>
    </Shell>
  )
}

const INVOICE_TONE: Record<Invoice['status'], 'green' | 'amber' | 'neutral' | 'red'> = {
  paid: 'green',
  open: 'amber',
  void: 'neutral',
  uncollectible: 'red'
}

export function InvoicesTab({ invoices }: { invoices: Section<Invoice[]> }): React.ReactElement {
  return (
    <Shell title="Invoices" desc="Receipts for the last 12 months.">
      <State
        section={invoices}
        empty={
          <Empty
            icon={<FileText size={20} />}
            title="No invoices yet"
            sub="Invoices appear after your first payment."
          />
        }
      >
        {(rows) => (
          <div className="bill-rows">
            <div className="bill-row bill-row-head">
              <span>Date</span>
              <span>Description</span>
              <span>Status</span>
              <span className="ta-r">Amount</span>
              <span />
            </div>
            {rows.map((r) => (
              <div className="bill-row" key={r.id}>
                <span>{new Date(r.date).toLocaleDateString()}</span>
                <span className="bill-row-name">{r.description}</span>
                <span>
                  <Badge tone={INVOICE_TONE[r.status]}>{r.status}</Badge>
                </span>
                <span className="ta-r bill-row-amt">{money(r.amount)}</span>
                <span className="ta-r">
                  {r.downloadUrl && (
                    <a
                      href={r.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Download invoice"
                    >
                      <Download size={15} />
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </State>
    </Shell>
  )
}

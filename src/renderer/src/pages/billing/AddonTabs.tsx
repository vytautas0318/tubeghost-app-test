import * as React from 'react'
import { Briefcase, Smartphone } from 'lucide-react'
import { SubList } from './SubList'
import { phoneSubToRow, proxySubToRow } from './subMappers'
import type { SubscriptionData } from './useSubscriptions'

/**
 * Proxy + phone add-on tabs.
 *
 * Both render TubeProxies subscriptions, which are separate Stripe
 * subscriptions from the TubeGhost plan — hence "billed alongside", not
 * "included". Management goes to the shared billing portal because the DB
 * denies user writes to these tables.
 */
export function ProxiesTab({
  subs,
  onBuy,
  onManage
}: {
  subs: SubscriptionData
  onBuy: () => void
  onManage: () => void
}): React.ReactElement {
  return (
    <SubList
      subs={subs.proxy ? [proxySubToRow(subs.proxy)] : []}
      section="Proxy add-ons"
      desc="US static residential IPs from TubeProxies, billed alongside your plan."
      emptyText={
        subs.loading ? 'Loading your subscriptions…' : 'Proxy subscriptions you buy appear here.'
      }
      ctaLabel="Buy proxies"
      ctaIcon={<Briefcase size={15} />}
      onCta={onBuy}
      onManage={onManage}
    />
  )
}

export function PhoneTab({
  subs,
  onBuy,
  onManage
}: {
  subs: SubscriptionData
  onBuy: () => void
  onManage: () => void
}): React.ReactElement {
  return (
    <SubList
      subs={subs.phone ? [phoneSubToRow(subs.phone)] : []}
      section="Phone numbers"
      desc="US SMS-verification numbers from TubeProxies, billed alongside your plan."
      emptyText={
        subs.loading
          ? 'Loading your subscriptions…'
          : 'Phone-number subscriptions you buy appear here.'
      }
      ctaLabel="Get a number"
      ctaIcon={<Smartphone size={15} />}
      onCta={onBuy}
      onManage={onManage}
    />
  )
}

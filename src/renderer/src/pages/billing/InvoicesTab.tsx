import * as React from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Invoices tab.
 *
 * Deliberately does not mirror Stripe's invoice list into our own UI —
 * Stripe is the system of record for receipts, handles PDF generation and
 * tax documents, and covers both products' charges in one place. We link
 * out rather than maintain a second, lagging copy.
 */
export function InvoicesTab({ onManage }: { onManage: () => void }): React.ReactElement {
  return (
    <div className="sec">
      <div className="sec-row">
        <div>
          <div className="sec-t">Invoices</div>
          <div className="sec-s">Receipts for the last 12 months.</div>
        </div>
        <Button onClick={onManage}>View in Stripe</Button>
      </div>
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <FileText size={20} style={{ margin: '0 auto 8px', color: 'var(--t4)' }} />
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--t1)' }}>
          Invoices live in Stripe
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '4px' }}>
          Open the billing portal to view and download receipts.
        </div>
      </div>
    </div>
  )
}

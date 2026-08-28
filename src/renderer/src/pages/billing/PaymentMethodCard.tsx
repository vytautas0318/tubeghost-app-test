// Payment method + billing email.
//
// The card shown is the one Stripe will ACTUALLY charge, resolved server-side
// through the subscription→customer default chain (see billing-info). All
// three actions open the same hosted portal session, since Stripe collects
// card details itself — raw card numbers never touch this app.

import * as React from 'react'
import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { Button, Input } from '@tubeghost/ui'
import type { PaymentMethod, Section } from './types'

export function PaymentMethodCard({
  method,
  email,
  onAdd,
  onUpdate,
  onRemove,
  onSaveEmail
}: {
  method: Section<PaymentMethod | null>
  email: string
  onAdd: () => void
  onUpdate: () => void
  onRemove: () => void
  onSaveEmail: (next: string) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(email)

  const startEdit = (): void => {
    setDraft(email)
    setEditing(true)
  }
  const save = (): void => {
    onSaveEmail(draft.trim())
    setEditing(false)
  }

  const pm = method.data

  return (
    <div className="sec">
      <div className="sec-t" style={{ marginBottom: '14px' }}>
        Payment method
      </div>

      {method.loading ? (
        <div className="pay-card bill-skel" aria-busy="true" />
      ) : method.error ? (
        <div className="pay-card">
          <div style={{ flex: 1 }}>
            <div className="card-no">Couldn&apos;t load payment method</div>
            <div className="card-exp">{method.error}</div>
          </div>
        </div>
      ) : pm ? (
        <div className="pay-card">
          <span className="pay-brand">{pm.brand}</span>
          <div style={{ flex: 1 }}>
            <div className="card-no">•••• {pm.last4}</div>
            <div className="card-exp">
              Exp {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
            </div>
          </div>
          <Button size="sm" onClick={onUpdate}>
            Update
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="pay-card">
          <div style={{ flex: 1 }}>
            <div className="card-no">No payment method on file</div>
            <div className="card-exp">Added when you upgrade or buy add-ons</div>
          </div>
          <Button size="sm" onClick={onAdd}>
            Add
          </Button>
        </div>
      )}

      <div className="bill-contact">
        <span className="bill-contact-k">Billing email</span>
        {editing ? (
          <span className="bill-email-edit">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Billing email"
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <button onClick={save} aria-label="Save billing email">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} aria-label="Cancel">
              <X size={14} />
            </button>
          </span>
        ) : (
          <span className="bill-contact-v">
            {email || '—'}
            <button onClick={startEdit} aria-label="Edit billing email">
              <Pencil size={12} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

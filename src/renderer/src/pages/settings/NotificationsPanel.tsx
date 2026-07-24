import * as React from 'react'
import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { usePrefs } from '@/store/prefs'
import { Button, Toggle, Input } from '@/components/ui'
import {
  NOTIFICATION_EVENTS,
  getNotificationPrefs,
  saveNotificationPrefs,
  validateWebhookUrl,
  sendWebhookTest,
  defaultPrefs,
  type NotificationPrefs
} from '@/lib/notifications'
import { Srow, type Toast } from './settingsCommon'

export function NotificationsPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const user = useAuth((s) => s.user)
  const email = user?.email ?? ''
  const desktop = usePrefs((s) => s.desktopNotifications)
  const setDesktop = usePrefs((s) => s.setDesktopNotifications)

  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs(email))
  const [webhookErr, setWebhookErr] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getNotificationPrefs(user.id, email)
      .then((p) => !cancelled && setPrefs(p))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Persist the caller's prefs (debounce-free: toggles are discrete events).
  const persist = async (next: NotificationPrefs): Promise<void> => {
    if (!user) return
    const prev = prefs
    setPrefs(next)
    try {
      await saveNotificationPrefs(user.id, next)
    } catch (e) {
      setPrefs(prev)
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    }
  }

  const toggleEvent = (key: string, on: boolean): void => {
    void persist({ ...prefs, events: { ...prefs.events, [key]: on } })
  }

  const commitEmail = (): void => {
    if ((prefs.notification_email ?? '') !== (email || null)) void persist(prefs)
  }

  const commitWebhook = (): void => {
    const reason = validateWebhookUrl(prefs.webhook_url ?? '')
    setWebhookErr(reason)
    if (!reason) void persist(prefs)
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    const res = await sendWebhookTest(prefs.webhook_url ?? '')
    setTesting(false)
    onToast(
      res.ok ? 'success' : 'error',
      res.ok ? 'Test payload delivered' : (res.error ?? 'Test failed')
    )
  }

  return (
    <>
      <div className="sec">
        <div className="sec-t">Events</div>
        <div className="sec-s">Choose what you get notified about.</div>
        {NOTIFICATION_EVENTS.map((ev) => (
          <Srow key={ev.key} n={ev.label} d={ev.desc}>
            <Toggle
              checked={prefs.events[ev.key] ?? false}
              onChange={(v) => toggleEvent(ev.key, v)}
            />
          </Srow>
        ))}
      </div>

      <div className="sec">
        <div className="sec-t">Delivery</div>
        <div className="sec-s">Where notifications are sent.</div>
        <div className="field">
          <label className="flabel">Email address</label>
          <Input
            value={prefs.notification_email ?? ''}
            onChange={(e) => setPrefs({ ...prefs, notification_email: e.target.value })}
            onBlur={commitEmail}
            placeholder={email}
          />
        </div>
        <Srow n="Desktop notifications" d="Show native alerts on this device." top>
          <Toggle checked={desktop} onChange={setDesktop} />
        </Srow>
        <div className="field" style={{ marginTop: '14px', marginBottom: 0 }}>
          <label className="flabel">Webhook URL</label>
          <Input
            value={prefs.webhook_url ?? ''}
            onChange={(e) => setPrefs({ ...prefs, webhook_url: e.target.value })}
            onBlur={commitWebhook}
            placeholder="https://hooks.slack.com/services/…"
            style={{ fontFamily: 'var(--mono)' }}
          />
          {webhookErr ? (
            <div className="fhint" style={{ color: 'var(--red)' }}>
              {webhookErr}
            </div>
          ) : (
            <div className="fhint">
              POST a JSON payload to Slack, Discord, or your own endpoint on every event.
            </div>
          )}
          <div className="foot-btns" style={{ marginTop: '12px' }}>
            <Button
              size="sm"
              icon={<Send size={14} />}
              disabled={
                testing ||
                !!validateWebhookUrl(prefs.webhook_url ?? '') ||
                !(prefs.webhook_url ?? '').trim()
              }
              onClick={test}
            >
              {testing ? 'Sending…' : 'Send test'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

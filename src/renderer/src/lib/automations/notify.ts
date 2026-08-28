// "Automation finished" notification emit (§12). This is the dispatcher the
// notifications.ts header comment marks as a future seam. On run completion we:
//   • fire a local desktop Notification (gated by the local desktopNotifications
//     pref) for immediate feedback to the running user, and
//   • invoke the notify-dispatch edge function, which reads each workspace
//     member's user_notification_prefs, checks the automation_done event, and
//     fans out to email / webhook server-side (avoids CORS + keeps secrets off
//     the renderer).
//
// Best-effort throughout: a notification failure never affects the run outcome.

import { getSupabase } from '@/lib/supabase'
import { usePrefs } from '@/store/prefs'
import type { AutomationWithMeta } from '@tubeghost/ui'
import type { ProfileResult, RunStatus } from '../../../../shared/automations/types'

export async function emitAutomationDone(
  auto: AutomationWithMeta,
  status: RunStatus,
  results: ProfileResult[]
): Promise<void> {
  const ok = results.filter((r) => r.status === 'success').length
  const failed = results.filter((r) => r.status === 'error').length
  const title = `Automation ${status === 'success' ? 'finished' : status}`
  const body = `${auto.name} · ${ok} ok${failed ? `, ${failed} failed` : ''}`

  // Local desktop notification (gated by the user's local pref).
  try {
    if (usePrefs.getState().desktopNotifications && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') new Notification(title, { body })
      }
    }
  } catch {
    /* desktop notification unavailable — ignore */
  }

  // Server-side fan-out to email/webhook per each member's prefs.
  try {
    const c = getSupabase()
    if (!c) return
    await c.functions.invoke('notify-dispatch', {
      body: {
        event: 'automation_done',
        workspace_id: auto.workspace_id,
        title,
        message: body,
        meta: { automation_id: auto.id, status, ok, failed }
      }
    })
  } catch {
    /* dispatch endpoint unavailable — the desktop notification already fired */
  }
}

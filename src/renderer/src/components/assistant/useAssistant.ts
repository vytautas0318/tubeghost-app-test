// State + logic for the agentic assistant. Holds the transcript, builds live
// context, and manages the confirm-before-acting flow: a "plan" message stays
// pending until the user approves it, then the executor runs the real actions
// and streams per-step results back into that message.

import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { useEffectivePermissions } from '@/lib/permissions'
import { listProfiles } from '@/lib/profiles'
import {
  askAssistant,
  buildContext,
  DEFAULT_MODEL,
  type AssistantTurn,
  type ModelChoice
} from '@/lib/assistant'
import { executePlan, type StepResult } from '@/lib/assistant-actions'
import { ACTION_TOOLS, type ActionPlan } from '../../../../shared/assistant/plan'

// A plan is read-only if every step is non-mutating (e.g. just list_profiles) —
// those run immediately with no confirmation prompt.
function isReadOnly(plan: ActionPlan): boolean {
  return plan.steps.length > 0 && plan.steps.every((s) => !ACTION_TOOLS[s.kind].mutating)
}

export type PlanStatus = 'pending' | 'running' | 'done' | 'cancelled'

// A chat message is either prose (user/assistant) or an actionable plan card.
export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  plan?: ActionPlan
  planStatus?: PlanStatus
  results?: StepResult[]
}

let seq = 0
function newId(): string {
  seq += 1
  return `a${seq}`
}

export interface AssistantState {
  messages: AssistantMessage[]
  busy: boolean
  model: ModelChoice
  setModel: (m: ModelChoice) => void
  send: (text: string) => Promise<void>
  approvePlan: (messageId: string) => Promise<void>
  cancelPlan: (messageId: string) => void
  reset: () => void
}

export function useAssistant(): AssistantState {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [busy, setBusy] = useState(false)
  // Selected Copilot model. Session state only (defaults to Haiku); NOT persisted
  // to localStorage — stays selected within the session, resets on relaunch.
  const [model, setModel] = useState<ModelChoice>(DEFAULT_MODEL)
  const { pathname } = useLocation()
  const workspace = useWorkspace((s) => s.current)
  const permissions = useEffectivePermissions()
  const userId = useAuth((s) => s.user?.id ?? null)

  const patch = useCallback((id: string, next: Partial<AssistantMessage>): void => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)))
  }, [])

  const send = useCallback(
    async (text: string): Promise<void> => {
      const clean = text.trim()
      if (!clean || busy) return

      const userMsg: AssistantMessage = { id: newId(), role: 'user', text: clean }
      // Only prose turns go into the model history (plans aren't conversational).
      const history: AssistantTurn[] = [...messages, userMsg]
        .filter((m) => typeof m.text === 'string')
        .map((m) => ({ role: m.role, text: m.text as string }))
      setMessages((prev) => [...prev, userMsg])
      setBusy(true)

      // Fetch the profile list so the assistant can resolve "the first profile"
      // or a name into real targets. Cheap + best-effort. Profiles no longer
      // launch in the web app, so "running" is always false.
      let profiles: { name: string; running: boolean }[] = []
      if (workspace) {
        const rows = await listProfiles(workspace.workspace_id).catch(() => [])
        profiles = rows.map((r) => ({ name: r.name, running: false }))
      }

      const context = buildContext({
        pathname,
        workspaceName: workspace?.workspace_name,
        roleName: workspace?.role_name,
        profiles
      })

      try {
        const res = await askAssistant(history, context, model)
        if (res.plan && isReadOnly(res.plan) && workspace) {
          // Read-only (e.g. list_profiles) — run immediately, no confirm, and
          // show the answer as a normal message instead of a plan card.
          const collected: StepResult[] = []
          await executePlan(
            res.plan,
            { workspaceId: workspace.workspace_id, permissions, userId },
            (r) => collected.push(r)
          )
          const answer = collected.map((r) => r.message).join(' ') || 'Done.'
          setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: answer }])
        } else if (res.plan) {
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: 'assistant', plan: res.plan, planStatus: 'pending' }
          ])
        } else {
          setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: res.reply }])
        }
      } catch (e) {
        setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: (e as Error).message }])
      } finally {
        setBusy(false)
      }
    },
    [busy, messages, pathname, workspace, permissions, userId, model]
  )

  const approvePlan = useCallback(
    async (messageId: string): Promise<void> => {
      const msg = messages.find((m) => m.id === messageId)
      if (!msg?.plan || msg.planStatus !== 'pending' || !workspace) return
      patch(messageId, { planStatus: 'running', results: [] })

      const collected: StepResult[] = []
      try {
        await executePlan(
          msg.plan,
          { workspaceId: workspace.workspace_id, permissions, userId },
          (r) => {
            collected.push(r)
            patch(messageId, { results: [...collected] })
          }
        )
      } finally {
        patch(messageId, { planStatus: 'done' })
      }
    },
    [messages, workspace, permissions, userId, patch]
  )

  const cancelPlan = useCallback(
    (messageId: string): void => patch(messageId, { planStatus: 'cancelled' }),
    [patch]
  )

  const reset = useCallback((): void => setMessages([]), [])

  return { messages, busy, model, setModel, send, approvePlan, cancelPlan, reset }
}

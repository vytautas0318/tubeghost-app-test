// The assistant's action-plan contract — the single bridge between what Gemini
// proposes and what the renderer executes. Dependency-free (no electron/
// supabase) so it's importable by the edge function (Deno), the renderer, and
// vitest. The renderer executor and the Gemini response schema are both derived
// from ACTION_TOOLS so they can never drift.

// ── Tool catalog ───────────────────────────────────────────────────────
export type ActionKind =
  | 'list_profiles'
  | 'create_profile'
  | 'launch_profile'
  | 'stop_profile'
  | 'assign_proxy'
  | 'run_automation'

export interface ToolParam {
  key: string
  type: 'string' | 'number'
  description: string
  required?: boolean
}

export interface ToolSpec {
  kind: ActionKind
  // Human label used in the confirmation card ("Create profile").
  label: string
  // True for actions that change state → require user confirmation. Read-only
  // tools (list) can run without a confirm so questions get answered directly.
  mutating: boolean
  // Permission key gating the action (RLS enforces it too; this is a pre-check).
  permission: string
  params: ToolParam[]
  // How to summarise one planned step for the confirmation card.
  summarize: (args: Record<string, unknown>) => string
}

const str = (a: Record<string, unknown>, k: string, d = ''): string =>
  typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string) : d

export const ACTION_TOOLS: Record<ActionKind, ToolSpec> = {
  list_profiles: {
    kind: 'list_profiles',
    label: 'List profiles',
    mutating: false,
    permission: 'profiles.view',
    params: [],
    summarize: () => 'Look up your profiles'
  },
  create_profile: {
    kind: 'create_profile',
    label: 'Create profile',
    mutating: true,
    permission: 'profiles.create',
    params: [
      { key: 'name', type: 'string', description: 'Profile name', required: true },
      { key: 'group', type: 'string', description: 'Optional group name to place it in' },
      {
        key: 'platform',
        type: 'string',
        description: 'Optional OS: windows | macos | linux'
      }
    ],
    summarize: (a) => `Create profile "${str(a, 'name', 'unnamed')}"`
  },
  launch_profile: {
    kind: 'launch_profile',
    label: 'Launch profile',
    mutating: true,
    permission: 'profiles.launch',
    params: [
      {
        key: 'profile',
        type: 'string',
        description: 'Profile name or, for a just-created one, its plan ref like "#1"',
        required: true
      }
    ],
    summarize: (a) => `Launch "${str(a, 'profile', '?')}"`
  },
  stop_profile: {
    kind: 'stop_profile',
    label: 'Stop profile',
    mutating: true,
    permission: 'profiles.launch',
    params: [{ key: 'profile', type: 'string', description: 'Profile name', required: true }],
    summarize: (a) => `Stop "${str(a, 'profile', '?')}"`
  },
  assign_proxy: {
    kind: 'assign_proxy',
    label: 'Assign proxy',
    mutating: true,
    permission: 'proxies.assign',
    params: [
      { key: 'profile', type: 'string', description: 'Profile name or plan ref', required: true }
    ],
    summarize: (a) => `Assign a proxy to "${str(a, 'profile', '?')}"`
  },
  run_automation: {
    kind: 'run_automation',
    label: 'Run automation',
    mutating: true,
    permission: 'automations.run',
    params: [
      { key: 'automation', type: 'string', description: 'Automation name', required: true }
    ],
    summarize: (a) => `Run automation "${str(a, 'automation', '?')}"`
  }
}

export const ACTION_KINDS = Object.keys(ACTION_TOOLS) as ActionKind[]

// ── Plan types ─────────────────────────────────────────────────────────
// One planned step. `ref` lets later steps reference an earlier create step's
// result (e.g. launch the profile created in step #1) — resolved at execution.
export interface PlanStep {
  id: string // "#1", "#2" — stable ref within a plan
  kind: ActionKind
  args: Record<string, unknown>
}

export interface ActionPlan {
  // A one-line human summary of the whole plan for the confirmation card.
  summary: string
  steps: PlanStep[]
}

// ── Gemini response schema ─────────────────────────────────────────────
// We ask Gemini to return EITHER a `reply` (prose answer / clarification) OR a
// `plan` (list of tool calls). The renderer decides: reply → show text; plan →
// show the confirmation card.
export const ASSISTANT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description:
        'A prose answer or clarifying question. Use this for questions, or when you need more info before acting. Empty when returning a plan.'
    },
    plan: {
      type: 'object',
      description: 'A set of actions to perform. Only when the user asked you to DO something.',
      properties: {
        summary: { type: 'string', description: 'One-line summary of what the plan does' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...ACTION_KINDS] },
              args: { type: 'object', description: 'Arguments for this action' }
            },
            required: ['kind'],
            propertyOrdering: ['kind', 'args']
          }
        }
      },
      propertyOrdering: ['summary', 'steps']
    }
  },
  propertyOrdering: ['reply', 'plan']
}

// A compact tool description injected into the system prompt.
export function toolCatalogForPrompt(): string {
  return ACTION_KINDS.map((k) => {
    const t = ACTION_TOOLS[k]
    const params = t.params
      .map((p) => `${p.key}${p.required ? '' : '?'} (${p.type})`)
      .join(', ')
    return `- ${k}: ${t.label}${params ? ` — args: ${params}` : ' — no args'}`
  }).join('\n')
}

// ── Validation ─────────────────────────────────────────────────────────
export interface ParsedResponse {
  reply?: string
  plan?: ActionPlan
  errors: string[]
}

interface RawResponse {
  reply?: unknown
  plan?: unknown
}

// Turn raw Gemini output into a safe reply-or-plan. Never throws. Unknown tool
// kinds are dropped (reported); a plan with no valid steps degrades to no plan.
export function parseResponse(raw: unknown): ParsedResponse {
  const errors: string[] = []
  if (raw == null || typeof raw !== 'object') return { errors: ['The assistant returned nothing usable.'] }
  const r = raw as RawResponse

  const reply = typeof r.reply === 'string' && r.reply.trim() ? r.reply.trim() : undefined

  let plan: ActionPlan | undefined
  if (r.plan && typeof r.plan === 'object') {
    const p = r.plan as { summary?: unknown; steps?: unknown }
    const rawSteps = Array.isArray(p.steps) ? p.steps : []
    const steps: PlanStep[] = []
    rawSteps.forEach((s: unknown, i: number) => {
      const step = s as { kind?: unknown; args?: unknown }
      const kind = step?.kind
      if (typeof kind !== 'string' || !ACTION_KINDS.includes(kind as ActionKind)) {
        errors.push(`Step ${i + 1}: unsupported action "${String(kind)}".`)
        return
      }
      const args =
        step.args && typeof step.args === 'object' ? (step.args as Record<string, unknown>) : {}
      // Reject steps whose REQUIRED args are missing/blank — otherwise the model
      // could emit a "launch ?" or "create unnamed" step that looks actionable
      // but has no real target. A bad step is dropped, not shown for approval.
      const missing = ACTION_TOOLS[kind as ActionKind].params
        .filter((p) => p.required)
        .filter((p) => typeof args[p.key] !== 'string' || !(args[p.key] as string).trim())
        .map((p) => p.key)
      if (missing.length > 0) {
        errors.push(`Step ${i + 1} (${kind}): missing required ${missing.join(', ')}.`)
        return
      }
      steps.push({ id: `#${steps.length + 1}`, kind: kind as ActionKind, args })
    })
    if (steps.length > 0) {
      const summary =
        typeof p.summary === 'string' && p.summary.trim()
          ? p.summary.trim()
          : steps.map((s) => ACTION_TOOLS[s.kind].summarize(s.args)).join(', then ')
      plan = { summary, steps }
    }
  }

  // A plan with real steps takes precedence; otherwise fall back to the reply.
  // If a plan was attempted but every step was invalid (and there's no reply),
  // surface a friendly ask rather than an empty/blank turn.
  if (!plan && !reply) {
    if (errors.length > 0) {
      return {
        reply: 'I couldn’t turn that into a valid action. Could you rephrase what you’d like me to do?',
        errors
      }
    }
    errors.push('The assistant returned an empty response.')
  }
  return { reply: plan ? undefined : reply, plan, errors }
}

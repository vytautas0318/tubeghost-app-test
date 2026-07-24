// Shared automation types — imported by BOTH the renderer (UI + orchestration)
// and the main process (CDP executor). Keep this dependency-free (no zod, no
// supabase, no electron) so either process can import it via a relative path.
//
// The catalog of actions + their param editors + node-label formatters lives
// in ./catalog.ts. The runtime executors (which drive the page over CDP) live
// in src/main/automations/actions/*, dispatched by ActionKey.

// ── Action keys ────────────────────────────────────────────────────
// `open_profile` is implicit — the engine prepends it at run time and it is
// shown as a fixed, non-removable node in the builder. It is NOT in ACTION_KEYS
// (users can't add/remove it).
export const ACTION_KEYS = [
  'watch_videos',
  'scroll_feed',
  'like_video',
  'post_comment',
  'subscribe',
  'upload_video',
  'solve_captcha',
  'wait_delay'
] as const

export type ActionKey = (typeof ACTION_KEYS)[number]

// A saved step in a flow. `params` is action-specific (see catalog defaults).
// `optional` steps do not fail the whole run when they error (default false
// for terminal actions, true for engagement actions — see catalog).
export interface Step {
  id: string
  type: ActionKey
  params: Record<string, unknown>
  optional?: boolean
}

// ── Trigger + scope ────────────────────────────────────────────────
export type TriggerType = 'manual' | 'scheduled'
export type ProfileScope = 'all' | 'groups' | 'profiles'

// Interval-based schedule kept deliberately simple (no raw cron): the
// main-process scheduler computes the next due time from this.
export type ScheduleKind = 'hourly' | 'daily' | 'weekly'
export interface Schedule {
  kind: ScheduleKind
  // Local hour 0-23 for daily/weekly (ignored for hourly).
  hour: number
  // 0-6 (Sun-Sat) for weekly (ignored otherwise).
  weekday: number
}

export interface Trigger {
  type: TriggerType
  schedule?: Schedule
  profileScope: ProfileScope
  // Present when profileScope is 'groups' | 'profiles'. Also mirrored into the
  // join tables so RLS/queries work; kept here too for a self-contained flow
  // export (Import/Export a flow JSON).
  groupIds?: string[]
  profileIds?: string[]
}

// The full flow definition (matches the `automations` row's jsonb columns).
export interface AutomationFlow {
  name: string
  trigger: Trigger
  steps: Step[]
}

// ── Run tracking ───────────────────────────────────────────────────
export type RunStatus = 'running' | 'success' | 'error' | 'cancelled'
export type StepStatus = 'ok' | 'skipped' | 'error'

export interface StepLog {
  stepId: string
  type: ActionKey | 'open_profile'
  status: StepStatus
  message?: string
  at: string // ISO timestamp
}

export interface ProfileResult {
  profileId: string
  profileName?: string
  status: RunStatus
  stepLogs: StepLog[]
}

// ── Runtime contract (main process) ────────────────────────────────
// The context an executor receives. `drive` is the thin CDP surface the
// main-process CdpPipe exposes for the active page (see cdp-pipe drive methods).
export interface StepContext {
  profileId: string
  // Fingerprint platform of the profile ('win' | 'mac' | ...) — informational.
  platform: string | null
  // The captcha solver config resolved from workspace settings (may be unset).
  captcha?: { provider: string | null; apiKey: string | null }
  // Human-like pacing knobs (jitter already applied per-profile by the engine).
  humanize: boolean
}

// One step's outcome, returned by an executor and by the runStep IPC.
export interface StepResult {
  status: StepStatus
  message?: string
}

// The IPC request main receives to execute a single step against a running
// profile's driven page. The engine (renderer) calls this once per step, in
// order, after launchProfile has the profile open.
export interface RunStepRequest {
  profileId: string
  step: Step
  context: StepContext
}

// ── Rate limits / safety caps (§8, §10) ────────────────────────────
// Per-profile / per-account guardrails so automations never burst. Defaults
// live in ./catalog.ts (DEFAULT_RATE_LIMITS). The engine enforces these before
// running an action for a profile within a run and across runs (via runs table).
export interface RateLimits {
  // Max engagement actions (like/comment/subscribe) per profile per run.
  maxEngagementPerRun: number
  // Max engagement actions per profile per rolling 24h (across runs).
  maxEngagementPerDay: number
  // Minimum seconds to stagger the start of consecutive profiles (anti-burst).
  minProfileStaggerSeconds: number
}

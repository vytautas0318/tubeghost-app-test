// Action catalog — the single source of truth for what each automation action
// is, its default params, how its params are edited, and how its node label
// summarises those params. Shared by the builder UI (renderer) and the engine.
//
// Each action is defined ONCE here; the runtime executor is dispatched by key
// in src/main/automations/executor.ts. Add a new action by (1) adding its key
// to ACTION_KEYS in ./types.ts, (2) adding an ACTIONS entry here, (3) adding an
// executor in src/main/automations/actions/.

import type { ActionKey, Step, RateLimits, ProfileScope, Trigger } from './types'

// A param field descriptor drives the generic StepParamsEditor. `kind` picks
// the control; the editor writes back into step.params[key].
export type ParamField =
  | { key: string; label: string; kind: 'number'; min?: number; max?: number; suffix?: string }
  | { key: string; label: string; kind: 'text'; placeholder?: string; multiline?: boolean }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'toggle' }

export interface ActionSpec {
  key: ActionKey
  label: string
  // Icon name resolved to a lucide icon in the renderer (see iconForAction).
  icon: string
  tone: string
  // Whether a failure of this step is non-fatal by default (§5). Engagement
  // actions default optional; terminal actions (upload) default required.
  optionalByDefault: boolean
  defaultParams: Record<string, unknown>
  fields: ParamField[]
  // One-line node summary shown on the canvas node, e.g. "Watch videos · 8–14 min".
  summarize: (params: Record<string, unknown>) => string
}

const num = (p: Record<string, unknown>, k: string, d: number): number =>
  typeof p[k] === 'number' ? (p[k] as number) : d
const str = (p: Record<string, unknown>, k: string, d = ''): string =>
  typeof p[k] === 'string' ? (p[k] as string) : d

export const ACTIONS: Record<ActionKey, ActionSpec> = {
  watch_videos: {
    key: 'watch_videos',
    label: 'Watch videos',
    icon: 'play',
    tone: 'red',
    optionalByDefault: true,
    defaultParams: { minMin: 8, maxMin: 14, count: 3, target: 'home' },
    fields: [
      { key: 'minMin', label: 'Min minutes', kind: 'number', min: 1, max: 180, suffix: 'min' },
      { key: 'maxMin', label: 'Max minutes', kind: 'number', min: 1, max: 180, suffix: 'min' },
      { key: 'count', label: 'How many videos', kind: 'number', min: 1, max: 50 },
      {
        key: 'target',
        label: 'Source',
        kind: 'select',
        options: [
          { value: 'home', label: 'Home feed' },
          { value: 'search', label: 'Search results' },
          { value: 'current', label: 'Current video' }
        ]
      }
    ],
    summarize: (p) => `Watch videos · ${num(p, 'minMin', 8)}–${num(p, 'maxMin', 14)} min`
  },
  scroll_feed: {
    key: 'scroll_feed',
    label: 'Scroll feed',
    icon: 'mouse-pointer',
    tone: 'blue',
    optionalByDefault: true,
    defaultParams: { seconds: 45, target: 'home' },
    fields: [
      { key: 'seconds', label: 'Duration', kind: 'number', min: 5, max: 600, suffix: 's' },
      {
        key: 'target',
        label: 'Where',
        kind: 'select',
        options: [
          { value: 'home', label: 'Home feed' },
          { value: 'subscriptions', label: 'Subscriptions' }
        ]
      }
    ],
    summarize: (p) =>
      `Scroll ${str(p, 'target', 'home') === 'home' ? 'home feed' : 'subscriptions'} · ${num(p, 'seconds', 45)}s`
  },
  like_video: {
    key: 'like_video',
    label: 'Like video',
    icon: 'thumbs-up',
    tone: 'red',
    optionalByDefault: true,
    defaultParams: { target: 'current', url: '' },
    fields: [
      {
        key: 'target',
        label: 'Target',
        kind: 'select',
        options: [
          { value: 'current', label: 'Current video' },
          { value: 'url', label: 'Specific URL' }
        ]
      },
      { key: 'url', label: 'Video URL', kind: 'text', placeholder: 'https://youtube.com/watch?v=…' }
    ],
    summarize: (p) => (str(p, 'target') === 'url' ? 'Like target video' : 'Like current video')
  },
  post_comment: {
    key: 'post_comment',
    label: 'Post comment',
    icon: 'message-square',
    tone: 'violet',
    optionalByDefault: true,
    defaultParams: { text: '', target: 'current', url: '' },
    fields: [
      {
        key: 'target',
        label: 'Target',
        kind: 'select',
        options: [
          { value: 'current', label: 'Current video' },
          { value: 'url', label: 'Specific URL' }
        ]
      },
      {
        key: 'url',
        label: 'Video URL',
        kind: 'text',
        placeholder: 'https://youtube.com/watch?v=…'
      },
      {
        key: 'text',
        label: 'Comment text (one per line = random pick)',
        kind: 'text',
        multiline: true,
        placeholder: 'Great video!\nLoved this 🔥'
      }
    ],
    summarize: (p) => {
      const t = str(p, 'text').split('\n').filter(Boolean)
      return t.length > 1 ? `Post comment · ${t.length} variants` : 'Post comment'
    }
  },
  subscribe: {
    key: 'subscribe',
    label: 'Subscribe',
    icon: 'user-plus',
    tone: 'green',
    optionalByDefault: true,
    defaultParams: { target: 'current', channelUrl: '' },
    fields: [
      {
        key: 'target',
        label: 'Channel',
        kind: 'select',
        options: [
          { value: 'current', label: 'Current channel' },
          { value: 'url', label: 'Specific channel URL' }
        ]
      },
      {
        key: 'channelUrl',
        label: 'Channel URL',
        kind: 'text',
        placeholder: 'https://youtube.com/@…'
      }
    ],
    summarize: (p) => (str(p, 'target') === 'url' ? 'Subscribe to channel' : 'Subscribe (current)')
  },
  upload_video: {
    key: 'upload_video',
    label: 'Upload video',
    icon: 'upload',
    tone: 'green',
    optionalByDefault: false,
    defaultParams: { title: '', description: '', tags: '', visibility: 'private', sourcePath: '' },
    fields: [
      {
        key: 'sourcePath',
        label: 'Video file path',
        kind: 'text',
        placeholder: '/path/to/video.mp4'
      },
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'text', multiline: true },
      { key: 'tags', label: 'Tags (comma separated)', kind: 'text' },
      {
        key: 'visibility',
        label: 'Visibility',
        kind: 'select',
        options: [
          { value: 'private', label: 'Private' },
          { value: 'unlisted', label: 'Unlisted' },
          { value: 'public', label: 'Public' }
        ]
      }
    ],
    summarize: (p) => `Upload video · ${str(p, 'visibility', 'private')}`
  },
  solve_captcha: {
    key: 'solve_captcha',
    label: 'Solve captcha',
    icon: 'shield-check',
    tone: 'amber',
    optionalByDefault: false,
    defaultParams: { timeoutSec: 120 },
    fields: [
      { key: 'timeoutSec', label: 'Timeout', kind: 'number', min: 20, max: 600, suffix: 's' }
    ],
    summarize: (p) => `Solve captcha · ${num(p, 'timeoutSec', 120)}s timeout`
  },
  wait_delay: {
    key: 'wait_delay',
    label: 'Wait / delay',
    icon: 'timer',
    tone: 'neutral',
    optionalByDefault: false,
    defaultParams: { mode: 'random', minS: 30, maxS: 90, fixedS: 300 },
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        options: [
          { value: 'random', label: 'Random range' },
          { value: 'fixed', label: 'Fixed' }
        ]
      },
      { key: 'minS', label: 'Min', kind: 'number', min: 1, max: 3600, suffix: 's' },
      { key: 'maxS', label: 'Max', kind: 'number', min: 1, max: 3600, suffix: 's' },
      { key: 'fixedS', label: 'Fixed delay', kind: 'number', min: 1, max: 7200, suffix: 's' }
    ],
    summarize: (p) =>
      str(p, 'mode', 'random') === 'fixed'
        ? `Wait ${Math.round(num(p, 'fixedS', 300) / 60) || num(p, 'fixedS', 300)} ${num(p, 'fixedS', 300) >= 60 ? 'min' : 'sec'}`
        : `Random delay ${num(p, 'minS', 30)}–${num(p, 'maxS', 90)}s`
  }
}

// Actions that count against the per-profile engagement rate limit (§8/§10).
export const ENGAGEMENT_ACTIONS: ActionKey[] = ['like_video', 'post_comment', 'subscribe']

export const DEFAULT_RATE_LIMITS: RateLimits = {
  maxEngagementPerRun: 10,
  maxEngagementPerDay: 40,
  minProfileStaggerSeconds: 3
}

// Build a fresh Step for a newly-added action (fresh id from the caller).
export function makeStep(id: string, type: ActionKey): Step {
  const spec = ACTIONS[type]
  return { id, type, params: { ...spec.defaultParams }, optional: spec.optionalByDefault }
}

export function summarizeStep(step: Step): string {
  return ACTIONS[step.type]?.summarize(step.params) ?? step.type
}

// ── Templates (§6) — stored as flow data; instantiated fresh when chosen. ──
export interface TemplateDef {
  id: string
  name: string
  desc: string
  icon: string
  build: () => {
    trigger: Trigger
    stepTypes: ActionKey[]
    overrides?: Record<number, Record<string, unknown>>
  }
}

const manual = (scope: ProfileScope = 'all'): Trigger => ({ type: 'manual', profileScope: scope })

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'warmup',
    name: 'Account warmup',
    desc: 'Age a fresh profile with natural activity',
    icon: 'sparkles',
    build: () => ({
      trigger: manual(),
      stepTypes: ['watch_videos', 'scroll_feed', 'wait_delay'],
      overrides: { 0: { minMin: 8, maxMin: 14 }, 2: { mode: 'random', minS: 30, maxS: 90 } }
    })
  },
  {
    id: 'scheduled_upload',
    name: 'Scheduled upload',
    desc: 'Queue and publish videos on a timetable',
    icon: 'download',
    build: () => ({
      trigger: {
        type: 'scheduled',
        profileScope: 'all',
        schedule: { kind: 'daily', hour: 9, weekday: 1 }
      },
      stepTypes: ['upload_video', 'wait_delay'],
      overrides: { 1: { mode: 'fixed', fixedS: 300 } }
    })
  },
  {
    id: 'engagement_pod',
    name: 'Engagement pod',
    desc: 'Cross-like and comment across your profiles',
    icon: 'users',
    build: () => ({
      trigger: manual(),
      stepTypes: ['like_video', 'post_comment'],
      overrides: { 0: { target: 'url' } }
    })
  },
  {
    id: 'blank',
    name: 'Blank flow',
    desc: 'Start from an empty canvas',
    icon: 'plus',
    build: () => ({ trigger: manual(), stepTypes: [] })
  }
]

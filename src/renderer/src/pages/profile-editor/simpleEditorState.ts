// Non-component state helpers for the profile editor's Simple mode.
// Kept out of the .tsx files so those export components only (React Fast
// Refresh requirement).

export type EditorMode = 'simple' | 'advanced'

const MODE_KEY = 'tpb.profile.editorMode'
const GUIDE_KEY = 'tpb.profile.guideSeen'

/**
 * The persisted editor mode. Simple by default, matching the design —
 * most edits are "point this profile at a different proxy" or "rename
 * it", which Simple answers on one screen.
 */
export function readEditorMode(): EditorMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

export function storeEditorMode(m: EditorMode): void {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* ignore — private mode / storage disabled */
  }
}

/** The "New here?" explainer shows until dismissed once, then never again. */
export function readGuideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === 'seen'
  } catch {
    return false
  }
}

export function storeGuideSeen(): void {
  try {
    localStorage.setItem(GUIDE_KEY, 'seen')
  } catch {
    /* ignore */
  }
}

// The plain-words explainer from the design (ProfileEditor.jsx GUIDE).
// Verbatim copy — it is the product's voice for non-technical operators,
// and rewording it would drift from the design system.
export const GUIDE_STEPS: [string, string][] = [
  [
    'A profile is one channel’s own computer.',
    'Whatever happens in this profile can’t be seen from any other one. That’s the whole point.'
  ],
  [
    'Give it a proxy.',
    'That’s the internet connection it uses. One channel, one connection — that’s what keeps them from looking related.'
  ],
  [
    'Leave the fingerprint alone.',
    'It’s the fake device details YouTube sees. We make them for you. Only press New fingerprint if you’re starting the channel over.'
  ],
  [
    'Link the extras if you have them.',
    'The authenticator gives you login codes. The phone number receives Google’s text messages. Both stay attached to this one channel.'
  ],
  [
    'Press Launch.',
    'The browser opens ready to use. Work exactly like normal — nothing else to set up.'
  ]
]

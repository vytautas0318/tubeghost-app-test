// "New here?" — the Simple editor's plain-language explainer.
//
// Shown until the user presses "Got it", then re-openable from the header
// button. The dismissal is a per-device preference (store/prefs), not profile
// state: it's about whether THIS user has read it, so it must not follow a
// profile around or sync to teammates.

import * as React from 'react'
import { HelpCircle } from 'lucide-react'

// Deliberately jargon-free: this is the surface a non-technical user reads
// first, so it explains what a profile IS before it explains any control.
const STEPS: [string, string][] = [
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

export function SimpleGuide({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <div className="sa-guide" id="sa-guide-panel">
      <div className="sa-guide-top">
        <div className="sa-guide-t">
          <HelpCircle />
          How this works, in plain words
        </div>
        <button type="button" className="sa-guide-x" onClick={onDismiss}>
          Got it
        </button>
      </div>
      <ol className="sa-guide-l">
        {STEPS.map(([head, body]) => (
          <li key={head}>
            <b>{head}</b>
            <span>{body}</span>
          </li>
        ))}
      </ol>
      <div className="sa-guide-f">
        Nothing here can break a channel. You can change any of it later.
      </div>
    </div>
  )
}

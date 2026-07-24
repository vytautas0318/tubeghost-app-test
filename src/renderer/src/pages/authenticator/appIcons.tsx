import * as React from 'react'

// Brand glyphs for the "Get the app" dropdown (§6). Inline SVG so no asset
// fetch / external host is needed (matches PlatformIcon's approach).
export const APPLE_ICON: React.ReactElement = (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M17 1.9c0 1-.4 2-1 2.7-.7.8-1.8 1.4-2.8 1.3-.1-1 .4-2 1-2.7.7-.8 1.9-1.4 2.8-1.3zM20 8.4c-1.1.7-1.8 1.9-1.8 3.3 0 1.5.9 2.9 2.2 3.5-.3.9-.7 1.7-1.2 2.5-.7 1-1.4 2-2.5 2-1.1 0-1.4-.7-2.7-.7-1.2 0-1.6.6-2.6.7-1.1 0-1.9-1.1-2.6-2.1-1.4-2-2.5-5.7-1-8.2.7-1.2 2-2 3.4-2 1 0 2 .7 2.7.7.6 0 1.8-.9 3.1-.7.5 0 2 .2 3 1.5z" />
  </svg>
)

export const ANDROID_ICON: React.ReactElement = (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M6 9v8a1 1 0 001 1h1v3a1.2 1.2 0 002.4 0v-3h3.2v3a1.2 1.2 0 002.4 0v-3h1a1 1 0 001-1V9H6zM3.8 9A1.2 1.2 0 002.6 10.2v5a1.2 1.2 0 002.4 0v-5A1.2 1.2 0 003.8 9zM20.2 9A1.2 1.2 0 0019 10.2v5a1.2 1.2 0 002.4 0v-5A1.2 1.2 0 0020.2 9zM15.5 2.3l.9-1.6a.3.3 0 00-.5-.3l-1 1.7A6 6 0 008 2.1l-1-1.7a.3.3 0 00-.5.3l.9 1.6A5.4 5.4 0 005.8 7h12.4a5.4 5.4 0 00-2.7-4.7zM9.2 5.1a.7.7 0 110-1.4.7.7 0 010 1.4zm5.6 0a.7.7 0 110-1.4.7.7 0 010 1.4z" />
  </svg>
)

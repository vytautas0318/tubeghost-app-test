import * as React from 'react'

// The TubeGhost Design System's own sidebar glyphs (from the design's icon set),
// reproduced verbatim so the rail matches the mockup pixel-for-pixel rather than
// approximating with lucide. Outline, 1.75 stroke.
const GLYPHS: Record<string, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  create: <path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-4M14 4h6m-3-3v6M3 9h6" />,
  profiles: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
    </>
  ),
  proxies: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.7 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.7-3.6-9s1.2-6.5 3.6-9z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2.5" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18" />
    </>
  ),
  accounts: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 16a4 4 0 018 0" />
    </>
  ),
  // Shield with a check — matches the DS Authenticator glyph.
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9.5 12l1.8 1.8L15 9.8" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </>
  ),
  extensions: (
    <>
      <path d="M14 4h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2M4 10V6a2 2 0 012-2h2" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <circle cx="17" cy="17" r="3" />
    </>
  ),
  automation: <path d="M12 2l2.4 5 5.6.8-4 4 1 5.6L12 20l-5 2.4 1-5.6-4-4 5.6-.8L12 2z" />,
  sync: <path d="M21 12a9 9 0 01-9 9 9 9 0 01-6.7-3M3 12a9 9 0 019-9 9 9 0 016.7 3M3 4v5h5M21 20v-5h-5" />,
  api: <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
  members: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </>
  ),
  roles: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
  billing: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2.5" />
      <path d="M16 12h.01M2 10h20" />
    </>
  ),
  partner: (
    <path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
  ),
  bulb: (
    <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z" />
  )
}

export type NavIconName = keyof typeof GLYPHS

export function NavIcon({
  name,
  size = 18
}: {
  name: NavIconName
  size?: number
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  )
}

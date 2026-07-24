import * as React from 'react'
import { Layers, Shield, User, Upload, Eye, Tag } from 'lucide-react'
import type { Tone } from './permSchema'

export const toneVar: Record<Tone, string> = {
  red: 'var(--red)',
  violet: 'var(--violet)',
  green: 'var(--green)',
  blue: 'var(--blue)',
  neutral: 'var(--t2)'
}
export const toneSoft: Record<Tone, string> = {
  red: 'var(--red-soft)',
  violet: 'var(--violet-soft)',
  green: 'var(--green-soft)',
  blue: 'var(--blue-soft)',
  neutral: 'var(--hover)'
}

// Map a role (by its default name) to the design's icon + tone. Custom roles
// fall back to a tag icon + neutral tone. Never used for permission logic —
// visuals only (CLAUDE.md: don't branch behaviour on role name).
const NAME_TONE: Record<string, Tone> = {
  Owner: 'red',
  Admin: 'violet',
  Editor: 'green',
  Uploader: 'blue',
  Viewer: 'neutral'
}
const NAME_ICON: Record<string, React.ReactNode> = {
  Owner: <Layers size={16} />,
  Admin: <Shield size={16} />,
  Editor: <User size={16} />,
  Uploader: <Upload size={16} />,
  Viewer: <Eye size={16} />
}

export function roleTone(name: string, isDefault: boolean): Tone {
  return (isDefault && NAME_TONE[name]) || 'neutral'
}
export function roleIcon(name: string, isDefault: boolean): React.ReactNode {
  return (isDefault && NAME_ICON[name]) || <Tag size={16} />
}

import * as React from 'react'
import { Eye, Hexagon, Layers, Upload, User, UserCog } from 'lucide-react'

// Single source of truth for role pill tone + icon, matching the Members
// redesign mockup: Owner=layers/red, Admin=hexagon/violet, Editor=user/green,
// Uploader=upload/amber, Viewer=eye/slate. Custom roles fall back to editor
// (green) with a generic icon. Tone maps to a `.role.<tone>` class in ds-kit.

export type RoleTone = 'owner' | 'admin' | 'editor' | 'uploader' | 'viewer'

export function roleTone(name: string): RoleTone {
  switch (name.toLowerCase()) {
    case 'owner':
      return 'owner'
    case 'admin':
      return 'admin'
    case 'uploader':
      return 'uploader'
    case 'viewer':
      return 'viewer'
    case 'editor':
    default:
      return 'editor'
  }
}

export function roleIcon(name: string, size = 13): React.ReactNode {
  switch (name.toLowerCase()) {
    case 'owner':
      return <Layers size={size} />
    case 'admin':
      return <Hexagon size={size} />
    case 'uploader':
      return <Upload size={size} />
    case 'viewer':
      return <Eye size={size} />
    case 'editor':
      return <User size={size} />
    default:
      return <UserCog size={size} />
  }
}

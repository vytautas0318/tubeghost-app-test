// Resolve the catalog's icon-name strings (see shared/automations/catalog) to
// lucide icons for the builder palette, canvas nodes, and template cards.

import * as React from 'react'
import {
  Play,
  MousePointer2,
  ThumbsUp,
  MessageSquare,
  UserPlus,
  Upload,
  ShieldCheck,
  Timer,
  AppWindow,
  Sparkles,
  Download,
  Users,
  Plus
} from 'lucide-react'

export function iconFor(name: string, size = 16): React.ReactNode {
  switch (name) {
    case 'play':
      return <Play size={size} />
    case 'mouse-pointer':
      return <MousePointer2 size={size} />
    case 'thumbs-up':
      return <ThumbsUp size={size} />
    case 'message-square':
      return <MessageSquare size={size} />
    case 'user-plus':
      return <UserPlus size={size} />
    case 'upload':
      return <Upload size={size} />
    case 'shield-check':
      return <ShieldCheck size={size} />
    case 'timer':
      return <Timer size={size} />
    case 'sparkles':
      return <Sparkles size={size} />
    case 'download':
      return <Download size={size} />
    case 'users':
      return <Users size={size} />
    case 'plus':
      return <Plus size={size} />
    default:
      return <AppWindow size={size} />
  }
}

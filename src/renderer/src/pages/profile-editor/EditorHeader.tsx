import * as React from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { Button, PlatformIcon, type OS } from '@tubeghost/ui'
import type { ProfileRow } from '@/lib/profiles'

// Full-width editor top bar (DS `.editor-top`): back chevron + platform badge +
// "Edit profile" / name·id, and Cancel / Save changes on the right. The badge's
// social glyph defaults to YouTube (TubeGhost is YouTube-focused; profiles have
// no per-profile social platform) with the real OS in the corner.
export function EditorHeader({
  isNew,
  profile,
  saving,
  canSave,
  onSave,
  onLeave,
  modeToggle,
  helpButton
}: {
  isNew: boolean
  profile: ProfileRow | null
  saving: boolean
  canSave: boolean
  onSave: () => void
  // Simple/Advanced switch, rendered before Cancel/Save. Passed in as a slot
  // so this header stays presentational and the editor keeps owning the mode.
  modeToggle?: React.ReactNode
  // "New here?" toggle, shown left of the mode switch in Simple.
  helpButton?: React.ReactNode
  // Parent injects a guarded navigation so dirty-state confirms can
  // intercept before the user loses unsaved edits.
  onLeave: (to: string) => void
}): React.ReactElement {
  const os: OS | undefined =
    profile?.platform === 'macos' ? 'mac' : profile?.platform === 'windows' ? 'win' : undefined
  const idStr = profile?.profile_number != null ? String(profile.profile_number) : ''

  return (
    <div className="editor-top">
      <div className="editor-top-l">
        <div className="editor-back" onClick={() => onLeave('/profiles')} title="Back to profiles">
          <ChevronLeft size={18} />
        </div>
        <PlatformIcon platform="yt" os={os} />
        <div>
          <div className="editor-title">{isNew ? 'New profile' : 'Edit profile'}</div>
          {!isNew && profile && (
            <div className="editor-sub">
              {profile.name || 'Untitled'}
              {idStr && (
                <>
                  {' · '}
                  <span style={{ fontFamily: 'var(--mono)' }}>{idStr}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="editor-top-r">
        {helpButton}
        {modeToggle}
        <Button variant="ghost" onClick={() => onLeave('/profiles')}>
          Cancel
        </Button>
        {canSave && (
          <Button variant="primary" icon={<Check size={15} />} onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  )
}

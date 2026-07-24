import * as React from 'react'
import { GhostAvatar } from '@/components/GhostAvatar'
import {
  GHOST_COLORS,
  GHOST_FACES,
  GHOST_GLASSES,
  GHOST_HATS,
  GHOST_HANDS
} from '@/components/ghost-avatar-parts'
import type { AvatarConfig } from '@/lib/avatar'

// "Customize avatar" popover: pick color + expression + glasses + hat +
// gesture, each shown as a live GhostAvatar preview. Controlled — the parent
// owns the config and persists it. DS classes (.avatar-pop / .ap-*) live in
// ds-kit.css. Ported from the design-system Sidebar mockup.
export function AvatarPicker({
  config,
  onChange,
  onDone,
  floating = false
}: {
  config: AvatarConfig
  onChange: (next: AvatarConfig) => void
  onDone: () => void
  // When true the popover is positioned by a parent (e.g. a fixed portal
  // wrapper), so drop the built-in absolute placement of `.avatar-pop`.
  floating?: boolean
}): React.ReactElement {
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]): void =>
    onChange({ ...config, [k]: v })

  return (
    <div
      className="avatar-pop"
      style={floating ? { position: 'static' } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ap-head">
        <GhostAvatar
          size={46}
          radius={13}
          color={config.color}
          face={config.face}
          glasses={config.glasses}
          hat={config.hat}
          hand={config.hand}
        />
        <div className="ap-title">Customize avatar</div>
        <span className="ap-done" onClick={onDone}>
          Done
        </span>
      </div>

      <div className="ap-sec">
        <div className="ap-label">Color</div>
        <div className="ap-row">
          {GHOST_COLORS.map((c) => (
            <div
              key={c}
              className={'ap-color' + (config.color === c ? ' on' : '')}
              style={{ background: c }}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
      </div>

      <div className="ap-sec">
        <div className="ap-label">Expression</div>
        <div className="ap-row">
          {GHOST_FACES.map((f) => (
            <div
              key={f}
              className={'ap-chip' + (config.face === f ? ' on' : '')}
              onClick={() => set('face', f)}
            >
              <GhostAvatar
                size={30}
                radius={8}
                color={config.color}
                face={f}
                glasses={config.glasses}
                hat={config.hat}
                hand={config.hand}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="ap-sec">
        <div className="ap-label">Glasses</div>
        <div className="ap-row">
          {GHOST_GLASSES.map((g) => (
            <div
              key={g}
              className={'ap-chip' + (config.glasses === g ? ' on' : '')}
              onClick={() => set('glasses', g)}
            >
              <GhostAvatar
                size={30}
                radius={8}
                color={config.color}
                face={config.face}
                glasses={g}
                hat={config.hat}
                hand={config.hand}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="ap-sec">
        <div className="ap-label">Hat</div>
        <div className="ap-row">
          {GHOST_HATS.map((h) => (
            <div
              key={h}
              className={'ap-chip' + (config.hat === h ? ' on' : '')}
              onClick={() => set('hat', h)}
            >
              <GhostAvatar
                size={30}
                radius={8}
                color={config.color}
                face={config.face}
                glasses={config.glasses}
                hat={h}
                hand={config.hand}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="ap-sec">
        <div className="ap-label">Gesture</div>
        <div className="ap-row">
          {GHOST_HANDS.map((h) => (
            <div
              key={h}
              className={'ap-chip' + (config.hand === h ? ' on' : '')}
              onClick={() => set('hand', h)}
            >
              <GhostAvatar
                size={30}
                radius={8}
                color={config.color}
                face={config.face}
                glasses={config.glasses}
                hat={config.hat}
                hand={h}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

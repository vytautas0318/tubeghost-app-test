import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/tubeghost-logo.png'

/**
 * AuthShell — TubeGhost Design System split auth layout: an always-dark brand
 * panel on the left (hidden on narrow widths) and a centered form pane on the
 * right with a Sign in / Create account segmented switch. Presentational only;
 * pages pass their form as children.
 */
export function AuthShell({
  mode,
  title,
  subtitle,
  children
}: {
  // omit `mode` to hide the switch (e.g. the "check your email" screen)
  mode?: 'signin' | 'signup'
  title: string
  subtitle?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] overflow-hidden">
      {/* Brand panel */}
      <div
        className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden text-white"
        style={{ background: 'radial-gradient(130% 90% at 50% -10%, #1F2128 0%, #131418 60%)' }}
      >
        <div className="flex items-center gap-3 relative z-10">
          <img src={logo} alt="TubeGhost" className="w-11 h-11 object-contain" />
          <div>
            <div className="text-[17px] font-[650] tracking-[-0.2px]">TubeGhost</div>
            <div className="text-xs text-[var(--sb-t3)] -mt-0.5">Browser</div>
          </div>
        </div>

        <div className="relative z-10">
          <img src={logo} alt="" className="w-[88px] h-[88px] object-contain mb-6" />
          <h1 className="text-[34px] font-[680] tracking-[-1px] leading-[1.1] mb-4 max-w-[420px]">
            Run every account from one place.
          </h1>
          <p className="text-[14.5px] leading-[1.6] text-[var(--sb-t2)] max-w-[400px]">
            Anti-detect profiles, residential proxies, and a built-in authenticator — for teams
            running serious operations.
          </p>
        </div>

        <div
          className="absolute -right-[120px] -bottom-[120px] w-[360px] h-[360px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(215, 0, 45,0.22), transparent 70%)' }}
        />
      </div>

      {/* Form pane */}
      <div className="grid place-items-center p-10 overflow-y-auto bg-[var(--bg)]">
        <div className="w-full max-w-[360px]">
          {mode && <AuthTabs active={mode} />}
          <h2 className="text-[23px] font-[680] tracking-[-0.5px] text-[var(--t1)]">{title}</h2>
          {subtitle && <p className="text-[13.5px] text-[var(--t2)] mt-1.5 mb-5">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

/** Segmented Sign in / Create account switch (DS .auth-switch). */
function AuthTabs({ active }: { active: 'signin' | 'signup' }): React.ReactElement {
  const navigate = useNavigate()
  const tab = (on: boolean): string =>
    'flex-1 h-[34px] rounded-[7px] text-[13px] font-semibold transition-colors ' +
    (on ? 'bg-[var(--active)] text-[var(--t1)] shadow-[var(--shadow)]' : 'text-[var(--t2)] hover:text-[var(--t1)]')
  return (
    <div className="flex gap-1 p-1 bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r)] mb-6">
      <button type="button" onClick={() => navigate('/signin')} className={tab(active === 'signin')}>
        Sign in
      </button>
      <button type="button" onClick={() => navigate('/signup')} className={tab(active === 'signup')}>
        Create account
      </button>
    </div>
  )
}

export function AuthDivider(): React.ReactElement {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-[var(--line)]" />
      </div>
      <div className="relative flex justify-center">
        <span className="px-2 text-[11px] uppercase tracking-wider text-[var(--t3)] bg-[var(--bg)]">or</span>
      </div>
    </div>
  )
}

export function AuthField({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--t2)] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export const authInputClass =
  'w-full px-3 py-2.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r)] text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

export const authSubmitClass =
  'w-full px-3 py-2.5 text-sm font-semibold bg-[var(--red)] text-white rounded-[var(--r)] shadow-[var(--shadow-red)] hover:bg-[var(--red-hover)] disabled:opacity-50 transition-colors'

export const authErrorClass =
  'text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-[var(--r)] px-3 py-2'

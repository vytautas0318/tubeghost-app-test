import * as React from 'react'
import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { Assistant } from './components/assistant/Assistant'
import { ProfilesList } from './pages/ProfilesList'
import { ProfileEditor } from './pages/ProfileEditor'
import { TeamPage } from './pages/team/TeamPage'
import { PreviewBanner } from './components/PreviewBanner'
import { EmptyState } from './pages/EmptyState'
import { Proxies } from './pages/Proxies'
import { Settings } from './pages/Settings'
import { BulkCreate } from './pages/BulkCreate'
import { Billing } from './pages/Billing'
import { Partner } from './pages/Partner'
import { Automations } from './pages/Automations'
import { Extensions } from './pages/Extensions'
import { Phone } from './pages/Phone'
import { Authenticator } from './pages/Authenticator'
import { BuyProxies } from './pages/BuyProxies'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { NoWorkspace } from './pages/NoWorkspace'
import { AcceptInvite } from './pages/AcceptInvite'
import { AuthCallback } from './pages/AuthCallback'
import { AuthClient } from './pages/AuthClient'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useTheme } from './store/theme'
// Importing the prefs store triggers its persist rehydrate → accent + density
// re-applied to <html> at boot (mirrors how theme.ts self-applies).
import './store/prefs'
import { useAuth } from './store/auth'
import { registerCurrentSession } from './lib/sessions'
import { useWorkspace } from './store/workspace'
import { isSupabaseConfigured } from './lib/supabase'
import { touchLastSeen } from './lib/members'

function App(): React.ReactElement {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const { initialized, user, init } = useAuth()
  const loadWorkspaces = useWorkspace((s) => s.load)
  const resetWorkspaces = useWorkspace((s) => s.reset)
  const wsLoading = useWorkspace((s) => s.loading)
  const wsAll = useWorkspace((s) => s.all)
  const wsCurrent = useWorkspace((s) => s.current)

  useEffect(() => {
    // Keep Tailwind's `.dark` and the DS's [data-theme] in sync (see theme.ts).
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (user) {
      loadWorkspaces()
      // Register this device in the login-sessions ledger (Security → Active
      // sessions). Best-effort; failure never blocks the app.
      void registerCurrentSession(user.id).catch(() => undefined)
    } else resetWorkspaces()
  }, [user, loadWorkspaces, resetWorkspaces])

  // Presence heartbeat: record last-seen when a workspace is active.
  useEffect(() => {
    if (user && wsCurrent) void touchLastSeen(wsCurrent.workspace_id)
  }, [user, wsCurrent])

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-8 bg-[var(--bg)]">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-bold text-[var(--t1)] mb-2">Supabase not configured</h1>
            <p className="text-sm text-[var(--t2)]">
              Set <code className="mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="mono">VITE_SUPABASE_ANON_KEY</code> in{' '}
              <code className="mono">.env</code> and restart{' '}
              <code className="mono">npm run dev</code>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Desktop OAuth bridge. Handled before every auth/workspace gate — and
  // before the `initialized` spinner — because this page's only job is to
  // fire the tubeghost:// deep link. It needs no session (the desktop app
  // claims the token server-to-server), and the visitor may or may not have
  // one; either way the gates below must not delay or swallow the redirect.
  if (pathname === '/auth-client') {
    return <AuthClient />
  }

  if (!initialized) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
          <div className="text-sm text-[var(--t3)]">Loading…</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* OAuth / email-confirmation links land here mid-flow (still
              unauthenticated until the code is exchanged). */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Invitees can preview the invite before authenticating. */}
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="*" element={<Navigate to="/signin" replace />} />
        </Routes>
      </div>
    )
  }

  // A recovery link signs the user in, but they came here to set a password —
  // handle it before the workspace gates below, which would otherwise swallow
  // the route behind the loading screen or NoWorkspace.
  if (pathname === '/reset-password') {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <ResetPassword />
      </div>
    )
  }

  // Authed but workspaces still loading.
  if (wsLoading && wsAll.length === 0) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
          <div className="text-sm text-[var(--t3)]">Loading workspace…</div>
        </div>
      </div>
    )
  }

  // Authed but no workspaces (Google sign-up, invitee who hasn't accepted
  // yet, or trigger failure). Still allow the accept-invite route through so a
  // brand-new invitee can join their first workspace.
  if (!wsCurrent) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="*" element={<NoWorkspace />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <PreviewBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className="main flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <RedirectAuthRoutes />
          <PageRoutes />
        </main>
      </div>
      <CommandPalette />
      <Assistant />
    </div>
  )
}

function RedirectAuthRoutes(): React.ReactElement | null {
  const { pathname, search } = useLocation()
  if (pathname === '/signin' || pathname === '/signup') {
    // Preserve an in-flight invitation: bounce to the accept flow, not the app.
    const invite = new URLSearchParams(search).get('invite')
    return <Navigate to={invite ? `/invite/${invite}` : '/profiles'} replace />
  }
  return null
}

// Page-level error boundary keyed on pathname: navigating away from a broken
// page clears the error without the user having to click "Try again".
function PageRoutes(): React.ReactElement {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary variant="page" resetKey={pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/profiles" replace />} />
        <Route path="/profiles" element={<ProfilesList />} />
        <Route path="/profiles/empty" element={<EmptyState />} />
        <Route path="/profiles/new" element={<ProfileEditor />} />
        <Route path="/profiles/:id" element={<ProfileEditor />} />
        <Route path="/proxies" element={<Proxies />} />
        {/* Members + Roles & access are now one tabbed page. Both tabs stay
            independently routable (deep-linkable); the old flat paths redirect
            so existing links/bookmarks keep working. */}
        <Route path="/team/members" element={<TeamPage />} />
        <Route path="/team/roles" element={<TeamPage />} />
        <Route path="/team" element={<Navigate to="/team/members" replace />} />
        <Route path="/members" element={<Navigate to="/team/members" replace />} />
        <Route path="/roles" element={<Navigate to="/team/roles" replace />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/extensions" element={<Extensions />} />
        {/* Design-system nav destinations without a real feature yet — placeholder
            pages so the sidebar matches the TubeGhost design. UI only. */}
        <Route path="/authenticator" element={<Authenticator />} />
        <Route path="/phone" element={<Phone />} />
        <Route path="/buy-proxies" element={<BuyProxies />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/partner" element={<Partner />} />
        <Route path="/bulk" element={<BulkCreate />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/profiles" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App

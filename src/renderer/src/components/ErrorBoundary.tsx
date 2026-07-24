import * as React from 'react'
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  // "page" = inline fallback that fits inside <main> (titlebar/sidebar stay alive).
  // "fullscreen" = top-level fallback that replaces the entire window.
  variant?: 'page' | 'fullscreen'
  // Bumping this key from the parent forces the boundary to drop its error
  // state — wire it to e.g. the current pathname so navigating away clears
  // a stuck page-level error without the user having to click "Try again".
  resetKey?: string | number
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private softReset = (): void => this.setState({ error: null })
  private hardReload = (): void => window.location.reload()

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    const variant = this.props.variant ?? 'page'
    const showStack = import.meta.env.DEV
    return (
      <Fallback
        variant={variant}
        error={this.state.error}
        showStack={showStack}
        onSoftReset={this.softReset}
        onHardReload={this.hardReload}
      />
    )
  }
}

function Fallback({
  variant,
  error,
  showStack,
  onSoftReset,
  onHardReload
}: {
  variant: 'page' | 'fullscreen'
  error: Error
  showStack: boolean
  onSoftReset: () => void
  onHardReload: () => void
}): React.ReactElement {
  const wrapper =
    variant === 'fullscreen'
      ? 'flex flex-col h-screen w-screen items-center justify-center bg-[var(--bg)] p-8'
      : 'flex-1 flex items-center justify-center p-8'

  return (
    <div className={wrapper}>
      <div className="max-w-lg w-full">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--red)]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--t1)]">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--t2)] mt-0.5">
              {variant === 'page'
                ? 'This page hit an error. The rest of the app is still working — try again, or pick another section from the sidebar.'
                : 'TubeGhost Browser hit an error and can&rsquo;t recover this view.'}
            </p>
          </div>
        </div>

        {showStack && (
          <pre className="text-[11px] mono text-[var(--t2)] bg-[var(--panel-2)] border border-[var(--line)] rounded-lg p-3 overflow-auto max-h-48 mb-4 whitespace-pre-wrap">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        )}

        <div className="flex gap-2">
          <button
            onClick={onSoftReset}
            className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={onHardReload}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Reload app
          </button>
        </div>
      </div>
    </div>
  )
}

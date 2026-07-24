import * as React from 'react'
import { Link } from 'react-router-dom'
import { Columns3, Plus } from 'lucide-react'

export function EmptyState(): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-[var(--line)]">
        <h2 className="text-xl font-bold text-[var(--t1)]">Profiles</h2>
      </div>
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--red-soft)] flex items-center justify-center">
            <Columns3 className="w-10 h-10 text-[var(--red)]" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-[var(--t1)] mb-2">
            Create your first browser profile
          </h2>
          <p className="text-sm text-[var(--t2)] mb-8">
            Each profile is an isolated Chromium instance with its own fingerprint, proxy, cookies,
            and extensions. Run as many channels as you need — they'll never see each other.
          </p>

          <div className="flex justify-center gap-2 mb-8">
            <Link
              to="/profiles/new"
              className="px-4 py-2.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create profile
            </Link>
            <Link
              to="/bulk"
              className="px-4 py-2.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised"
            >
              Bulk import
            </Link>
          </div>

          <div className="bg-brand-surface/40 dark:bg-night-surface rounded-xl p-5 text-left">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-3">
              Get set up in 3 steps
            </div>
            <div className="space-y-3">
              <Step
                n={1}
                active
                title="Connect TubeProxies"
                desc="Paste your API key in Settings → TubeProxies. Your IPs become available everywhere."
              />
              <Step
                n={2}
                title="Create a profile"
                desc="Pick a TubeProxies IP — fingerprint auto-coheres to its geo and timezone."
              />
              <Step
                n={3}
                title="Launch"
                desc="Click play. A real Chromium window opens, fully isolated from your other profiles."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  desc,
  active = false
}: {
  n: number
  title: string
  desc: string
  active?: boolean
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div
        className={
          active
            ? 'w-6 h-6 rounded-full bg-[var(--red)] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5'
            : 'w-6 h-6 rounded-full bg-[var(--hover)] text-[var(--t3)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5'
        }
      >
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--t1)]">{title}</div>
        <div className="text-xs text-[var(--t3)]">{desc}</div>
      </div>
    </div>
  )
}

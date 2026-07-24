import * as React from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { ExtensionWithAssignment } from '@/lib/extensions'
import { ExtTile } from './ExtTile'
import { scopeMeta } from './extView'

// "Options"/details panel. Chromium extension options pages can't be opened
// from this Electron renderer (they live inside the launched profile), so we
// surface a read-only details view: metadata + the manifest's declared
// permissions + a note about where the options page lives.
export function ExtDetails({
  ext,
  onClose
}: {
  ext: ExtensionWithAssignment
  onClose: () => void
}): React.ReactElement {
  const m = (ext.manifest ?? {}) as {
    permissions?: unknown
    host_permissions?: unknown
    options_page?: unknown
    options_ui?: { page?: unknown }
  }
  const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : []
  const hosts = Array.isArray(m.host_permissions) ? (m.host_permissions as string[]) : []
  const optionsPage =
    (typeof m.options_page === 'string' && m.options_page) ||
    (m.options_ui && typeof m.options_ui.page === 'string' ? (m.options_ui.page as string) : null)
  const scope = scopeMeta(ext.permission_scope)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        className="relative w-[460px] max-h-[80vh] flex flex-col bg-[var(--bg)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-start gap-3">
          <ExtTile name={ext.name} iconDataUrl={ext.icon_data_url} size={40} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[var(--t1)] truncate">{ext.name}</h3>
            <p className="text-xs text-[var(--t3)] mt-0.5">
              {(ext.publisher || 'Unknown') + ' · v' + (ext.version || '0.0.0')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--t4)] hover:text-[var(--t1)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto text-sm">
          {ext.description && <p className="text-[var(--t2)]">{ext.description}</p>}

          <div className="flex items-center gap-2">
            <Badge tone="neutral">{ext.category || 'Utility'}</Badge>
            <span className="ext-perm">
              <span className="ext-perm-dot" style={{ background: scope.color }} />
              {scope.label}
            </span>
          </div>

          <Section title="Host access">
            {hosts.length === 0 ? (
              <span className="text-[var(--t3)]">None declared.</span>
            ) : (
              <ul className="space-y-1">
                {hosts.map((h) => (
                  <li key={h} className="mono text-xs text-[var(--t2)]">
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Permissions">
            {perms.length === 0 ? (
              <span className="text-[var(--t3)]">None declared.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {perms.map((p) => (
                  <span
                    key={p}
                    className="mono text-[11px] px-2 py-0.5 rounded bg-[var(--hover)] text-[var(--t2)]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </Section>

          <div className="text-[11px] text-[var(--t3)] bg-[var(--panel-2)] border border-[var(--line)] rounded p-2.5">
            {optionsPage
              ? `This extension has an options page (${optionsPage}). Open it from inside a launched profile that has this extension enabled.`
              : 'This extension declares no options page.'}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--t2)] mb-1.5">{title}</div>
      {children}
    </div>
  )
}

// "Custom inline" sub-tab of ProxyCard. Renders the form fields,
// test-result banner, Save + Test buttons. Encapsulates only the
// presentation; all the save/test/validation logic stays in ProxyCard.tsx.

import * as React from 'react'
import { Loader2, Save, Zap } from 'lucide-react'
import { ProxyCardFields, type ProxyFieldsState } from './ProxyCardFields'

export type TestResult =
  | { ok: true; egress: string; ms: number }
  | { ok: false; reason: string }
  | null

export function ProxyCustomMode({
  form,
  setForm,
  canEdit,
  saving,
  testing,
  dirty,
  valid,
  hasHost,
  testResult,
  onTest,
  onSave
}: {
  form: ProxyFieldsState
  setForm: (next: ProxyFieldsState) => void
  canEdit: boolean
  saving: boolean
  testing: boolean
  dirty: boolean
  valid: boolean
  hasHost: boolean
  testResult: TestResult
  onTest: () => void
  onSave: () => void
}): React.ReactElement {
  const fieldsDisabled = !canEdit || saving
  return (
    <>
      {testResult?.ok && (
        <div className="mb-3 px-3 py-2 text-xs bg-[var(--green-soft)] text-[var(--green)] rounded-md">
          ✓ Proxy works · egress <span className="mono">{testResult.egress}</span> · {testResult.ms}ms
        </div>
      )}
      {testResult && !testResult.ok && (
        <div className="mb-3 px-3 py-2 text-xs bg-[var(--red-soft)] text-[var(--red)] rounded-md">
          ✗ Test failed: {testResult.reason}
        </div>
      )}

      <ProxyCardFields
        form={form}
        disabled={fieldsDisabled}
        onChange={(patch) => setForm({ ...form, ...patch })}
      />

      <div className="mt-4 flex items-center justify-end gap-2">
        {canEdit && hasHost && (
          <button
            onClick={onTest}
            disabled={testing || saving || !valid}
            className="px-2.5 py-1 text-xs font-medium border border-[var(--line)] rounded-md text-[var(--t1)] hover:bg-[var(--hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {testing ? 'Testing…' : 'Test'}
          </button>
        )}
        {canEdit && (
          <button
            onClick={onSave}
            disabled={!dirty || saving || !valid}
            className="px-2.5 py-1 text-xs font-medium bg-[var(--red)] text-white rounded-md hover:bg-[var(--red-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save proxy'}
          </button>
        )}
      </div>
    </>
  )
}

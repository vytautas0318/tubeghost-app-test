// Build a fresh editable flow from a template (or a blank flow). Kept out of
// AutomationBuilder.tsx so that component file only exports components (the
// react-refresh rule) — this is a plain helper.

import { makeStep } from '../../../../shared/automations/catalog'
import type { AutomationFlow, Step, ActionKey } from '../../../../shared/automations/types'

export function flowFromTemplate(
  template: {
    trigger: AutomationFlow['trigger']
    stepTypes: ActionKey[]
    overrides?: Record<number, Record<string, unknown>>
  },
  name: string
): AutomationFlow {
  let n = 0
  const steps: Step[] = template.stepTypes.map((key, i) => {
    const s = makeStep('s' + ++n, key)
    if (template.overrides?.[i]) s.params = { ...s.params, ...template.overrides[i] }
    return s
  })
  return { name, trigger: template.trigger, steps }
}

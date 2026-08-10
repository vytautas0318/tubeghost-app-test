import { describe, expect, it } from 'vitest'
import { orderSteps, stepLabel, tubeproxiesMetadata, type Order } from '../order.js'

const base: Order = {
  workspaceId: 'ws_1',
  plan: 'team',
  cycle: 'monthly',
  profiles: 100,
  seats: 3,
  proxies: 0,
  numbers: 0
}

describe('order steps', () => {
  it('is plan-only when no add-ons are selected', () => {
    expect(orderSteps(base).map((s) => s.kind)).toEqual(['plan'])
  })

  it('adds a step per selected add-on', () => {
    expect(orderSteps({ ...base, proxies: 25 }).map((s) => s.kind)).toEqual(['plan', 'proxies'])
    expect(orderSteps({ ...base, numbers: 3 }).map((s) => s.kind)).toEqual(['plan', 'numbers'])
    expect(orderSteps({ ...base, proxies: 25, numbers: 3 }).map((s) => s.kind)).toEqual([
      'plan',
      'proxies',
      'numbers'
    ])
  })

  it('always runs the plan first', () => {
    // If the customer abandons partway they should hold the plan they came
    // for, not proxies attached to a free workspace.
    const steps = orderSteps({ ...base, proxies: 50, numbers: 7 })
    expect(steps[0].kind).toBe('plan')
  })

  it('carries the configured bundle size on each step', () => {
    const steps = orderSteps({ ...base, proxies: 50, numbers: 7 })
    expect(steps.find((s) => s.kind === 'proxies')?.quantity).toBe(50)
    expect(steps.find((s) => s.kind === 'numbers')?.quantity).toBe(7)
  })

  it('labels every step kind', () => {
    for (const s of orderSteps({ ...base, proxies: 25, numbers: 3 })) {
      expect(stepLabel(s.kind).length).toBeGreaterThan(0)
    }
  })
})

describe('TubeProxies metadata contract', () => {
  // These keys are THEIR dispatcher's contract, not ours. Renaming any of
  // them sends the purchase down their else-branch, which bails on missing
  // fields — the customer pays and receives nothing.
  it('tags phone orders with the type their handler branches on', () => {
    const m = tubeproxiesMetadata('numbers', 3, 'user_1')
    expect(m.type).toBe('phone_number')
    expect(m.phone_quantity).toBe('3')
    expect(m.user_id).toBe('user_1')
  })

  it('sends proxy orders the count and plan name their handler reads', () => {
    const m = tubeproxiesMetadata('proxies', 25, 'user_1', 'Growth')
    expect(m.proxy_count).toBe('25')
    expect(m.plan_name).toBe('Growth')
    expect(m.user_id).toBe('user_1')
  })

  it('does NOT tag proxy orders with a type, so they hit the default branch', () => {
    // Their dispatcher routes phone/ama/socks5 by `type` and treats
    // everything else as a proxy purchase.
    const m = tubeproxiesMetadata('proxies', 25, 'user_1', 'Growth')
    expect(m.type).toBeUndefined()
  })
})

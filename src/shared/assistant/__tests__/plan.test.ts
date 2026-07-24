// Tests for the assistant action-plan schema/parser — the bridge between raw
// Gemini output and the executor. Covers reply-vs-plan routing, ref/step
// numbering, unsupported-tool rejection, and graceful failure.

import { describe, it, expect } from 'vitest'
import {
  ASSISTANT_RESPONSE_SCHEMA,
  ACTION_KINDS,
  toolCatalogForPrompt,
  parseResponse
} from '../plan'

describe('toolCatalogForPrompt', () => {
  it('lists every supported action and no invented ones', () => {
    const cat = toolCatalogForPrompt()
    for (const k of ACTION_KINDS) expect(cat).toContain(k)
    expect(cat).not.toContain('delete_workspace')
    expect(cat).not.toContain('send_email')
  })
})

describe('ASSISTANT_RESPONSE_SCHEMA', () => {
  it('constrains plan step kinds to real actions', () => {
    const stepEnum = (ASSISTANT_RESPONSE_SCHEMA.properties as any).plan.properties.steps.items
      .properties.kind.enum
    expect(stepEnum).toEqual([...ACTION_KINDS])
  })
})

describe('parseResponse — reply routing', () => {
  it('returns a prose reply when no plan', () => {
    const r = parseResponse({ reply: 'Go to the Proxies page.' })
    expect(r.reply).toMatch(/proxies/i)
    expect(r.plan).toBeUndefined()
  })
})

describe('parseResponse — plan routing', () => {
  it('builds a numbered plan and prefers it over any reply', () => {
    const r = parseResponse({
      reply: 'ignored when a plan exists',
      plan: {
        summary: 'Create 2 profiles and launch them',
        steps: [
          { kind: 'create_profile', args: { name: 'A' } },
          { kind: 'create_profile', args: { name: 'B' } },
          { kind: 'launch_profile', args: { profile: '#1' } },
          { kind: 'launch_profile', args: { profile: '#2' } }
        ]
      }
    })
    expect(r.reply).toBeUndefined()
    expect(r.plan!.steps.map((s) => s.id)).toEqual(['#1', '#2', '#3', '#4'])
    expect(r.plan!.steps[0].kind).toBe('create_profile')
    expect(r.plan!.summary).toMatch(/launch/i)
  })

  it('synthesizes a summary when the model omits one', () => {
    const r = parseResponse({ plan: { steps: [{ kind: 'list_profiles', args: {} }] } })
    expect(r.plan!.summary).toBeTruthy()
  })

  it('drops unsupported tool kinds and reports them', () => {
    const r = parseResponse({
      plan: {
        steps: [
          { kind: 'create_profile', args: { name: 'ok' } },
          { kind: 'wipe_everything', args: {} }
        ]
      }
    })
    expect(r.plan!.steps).toHaveLength(1)
    expect(r.errors.some((e) => /wipe_everything/.test(e))).toBe(true)
  })

  it('falls back to reply when a plan has zero valid steps', () => {
    const r = parseResponse({ reply: 'I can help with that', plan: { steps: [{ kind: 'nope' }] } })
    expect(r.plan).toBeUndefined()
    expect(r.reply).toMatch(/help/i)
  })

  it('drops steps missing required args (no "unnamed"/"?" plans)', () => {
    const r = parseResponse({
      plan: {
        steps: [
          { kind: 'create_profile', args: {} }, // missing name
          { kind: 'launch_profile', args: {} }, // missing profile
          { kind: 'create_profile', args: { name: 'Good' } } // valid
        ]
      }
    })
    expect(r.plan!.steps).toHaveLength(1)
    expect(r.plan!.steps[0].args.name).toBe('Good')
    expect(r.errors.some((e) => /missing required name/i.test(e))).toBe(true)
    expect(r.errors.some((e) => /missing required profile/i.test(e))).toBe(true)
  })

  it('returns a friendly reply when every step was invalid', () => {
    const r = parseResponse({
      plan: { steps: [{ kind: 'create_profile', args: {} }, { kind: 'launch_profile', args: {} }] }
    })
    expect(r.plan).toBeUndefined()
    expect(r.reply).toMatch(/couldn’t turn that into a valid action|rephrase/i)
  })

  it('accepts a plan ref like "#1" as a valid profile arg', () => {
    const r = parseResponse({
      plan: {
        steps: [
          { kind: 'create_profile', args: { name: 'A' } },
          { kind: 'launch_profile', args: { profile: '#1' } }
        ]
      }
    })
    expect(r.plan!.steps).toHaveLength(2)
  })
})

describe('parseResponse — graceful failure', () => {
  it('never throws on garbage', () => {
    for (const g of [null, undefined, 42, 'x', [], {}, { plan: 5 }]) {
      expect(() => parseResponse(g)).not.toThrow()
    }
  })
  it('reports an error for an empty response', () => {
    const r = parseResponse({})
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.reply).toBeUndefined()
    expect(r.plan).toBeUndefined()
  })
})

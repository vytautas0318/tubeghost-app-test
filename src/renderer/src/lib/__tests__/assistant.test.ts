// Tests for the assistant lib wrapper: the send round-trip, context/message
// passthrough, the route-label + context builder, and graceful failure on
// network/API errors (including the non-2xx FunctionsHttpError body extraction).

import { describe, it, expect, vi, beforeEach } from 'vitest'

let invokeImpl: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }>
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    functions: { invoke: (name: string, opts: { body: unknown }) => invokeImpl(name, opts) }
  })
}))

import { askAssistant, buildContext, routeLabel } from '@/lib/assistant'

beforeEach(() => {
  invokeImpl = async () => ({ data: null, error: null })
})

describe('askAssistant', () => {
  it('sends messages + context and returns the reply text', async () => {
    invokeImpl = async (name, opts) => {
      expect(name).toBe('assistant')
      const body = opts.body as Record<string, unknown>
      expect(Array.isArray(body.messages)).toBe(true)
      expect((body.messages as unknown[]).length).toBe(1)
      expect(body.context).toContain('Proxies')
      // The edge fn returns JSON text; askAssistant parses it to reply-or-plan.
      expect(body.toolCatalog).toBeTruthy()
      expect(body.responseSchema).toBeTruthy()
      return {
        data: { text: JSON.stringify({ reply: 'Go to the Proxies page and click Test.' }) },
        error: null
      }
    }
    const res = await askAssistant(
      [{ role: 'user', text: 'how do I test a proxy?' }],
      'The user is currently on the "Proxies" page.'
    )
    expect(res.reply).toMatch(/proxies page/i)
    expect(res.plan).toBeUndefined()
  })

  it('parses JSON even when wrapped in ```json fences (Claude habit)', async () => {
    invokeImpl = async () => ({
      data: { text: '```json\n{"reply": "Go to the Proxies page."}\n```' },
      error: null
    })
    const res = await askAssistant([{ role: 'user', text: 'help' }], '')
    expect(res.reply).toMatch(/proxies page/i)
  })

  it('returns an action plan when the model proposes one', async () => {
    invokeImpl = async () => ({
      data: {
        text: JSON.stringify({
          plan: {
            summary: 'Create 1 profile',
            steps: [{ kind: 'create_profile', args: { name: 'A' } }]
          }
        })
      },
      error: null
    })
    const res = await askAssistant([{ role: 'user', text: 'make a profile' }], '')
    expect(res.plan).toBeTruthy()
    expect(res.plan!.steps).toHaveLength(1)
    expect(res.reply).toBeUndefined()
  })

  it('extracts the real error body from a non-2xx FunctionsHttpError', async () => {
    invokeImpl = async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({ error: 'The assistant is not configured (missing API key).' }),
          { status: 500 }
        )
      }
    })
    await expect(askAssistant([{ role: 'user', text: 'hi' }], '')).rejects.toThrow(/not configured/i)
  })

  it('maps a network error to a readable message', async () => {
    invokeImpl = async () => ({ data: null, error: { message: 'Failed to fetch' } })
    await expect(askAssistant([{ role: 'user', text: 'hi' }], '')).rejects.toThrow(/could not reach/i)
  })

  it('throws when the reply is empty', async () => {
    invokeImpl = async () => ({ data: { text: '' }, error: null })
    await expect(askAssistant([{ role: 'user', text: 'hi' }], '')).rejects.toThrow(/empty/i)
  })

  it('times out (never hangs) if the edge function stalls', async () => {
    // Never resolves — simulates a stuck function that would freeze "Thinking…".
    invokeImpl = () => new Promise(() => {})
    vi.useFakeTimers()
    const p = askAssistant([{ role: 'user', text: 'hi' }], '')
    const assertion = expect(p).rejects.toThrow(/took too long/i)
    await vi.advanceTimersByTimeAsync(46_000)
    await assertion
    vi.useRealTimers()
  })
})

describe('routeLabel', () => {
  it('maps known routes to friendly labels', () => {
    expect(routeLabel('/proxies')).toBe('Proxies')
    expect(routeLabel('/api')).toBe('API & AI MCP')
  })
  it('maps a sub-route to its section label', () => {
    expect(routeLabel('/profiles/abc-123')).toBe('Profiles')
  })
  it('falls back to the raw path for unknown routes', () => {
    expect(routeLabel('/nowhere')).toBe('/nowhere')
  })
})

describe('buildContext', () => {
  it('includes page, workspace, and role', () => {
    const ctx = buildContext({ pathname: '/profiles', workspaceName: 'Acme', roleName: 'Admin' })
    expect(ctx).toContain('Profiles')
    expect(ctx).toContain('Acme')
    expect(ctx).toContain('Admin')
  })
  it('omits role when it is the placeholder dash', () => {
    const ctx = buildContext({ pathname: '/proxies', workspaceName: 'Acme', roleName: '—' })
    expect(ctx).not.toContain('role')
  })
  it('works with no workspace info', () => {
    const ctx = buildContext({ pathname: '/settings' })
    expect(ctx).toContain('Settings')
  })

  it('lists the user profiles in order so the model can resolve them', () => {
    const ctx = buildContext({
      pathname: '/profiles',
      profiles: [
        { name: 'test-1', running: true },
        { name: 'test-2', running: false }
      ]
    })
    expect(ctx).toContain('2 profile')
    expect(ctx).toContain('1. "test-1" (running)')
    expect(ctx).toContain('2. "test-2"')
    expect(ctx).toMatch(/the first|position/i)
  })

  it('says so when there are no profiles', () => {
    const ctx = buildContext({ pathname: '/profiles', profiles: [] })
    expect(ctx).toMatch(/no profiles/i)
  })
})

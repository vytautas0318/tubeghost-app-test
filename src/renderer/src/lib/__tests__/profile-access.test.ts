// Mirrors ghost.can_access_group (migration 0023). RLS is the real boundary;
// this pins the RULES so a future change to the SQL has a failing test to
// argue with.
//
// The ungrouped case is the reason 0023 exists: 0021 made ungrouped profiles
// visible to EVERYONE, which meant dragging a profile out of its group silently
// exposed it workspace-wide.

import { describe, expect, it } from 'vitest'

interface Ctx {
  restrictionOn: boolean
  isWorkspaceAdmin: boolean
  grantedGroupIds: string[]
}

/** The predicate migration 0023 encodes, in TS, for testing. */
function canAccess(ctx: Ctx, profileGroupId: string | null): boolean {
  if (!ctx.restrictionOn) return true
  if (ctx.isWorkspaceAdmin) return true
  // Ungrouped → admins only. A null group can never match a grant.
  if (profileGroupId === null) return false
  return ctx.grantedGroupIds.includes(profileGroupId)
}

const member = (groups: string[]): Ctx => ({
  restrictionOn: true,
  isWorkspaceAdmin: false,
  grantedGroupIds: groups
})
const admin: Ctx = { restrictionOn: true, isWorkspaceAdmin: true, grantedGroupIds: [] }

describe('restriction OFF (default)', () => {
  const ctx: Ctx = { restrictionOn: false, isWorkspaceAdmin: false, grantedGroupIds: [] }

  it('leaves every profile visible, grouped or not', () => {
    expect(canAccess(ctx, 'g1')).toBe(true)
    expect(canAccess(ctx, null)).toBe(true)
  })
})

describe('ungrouped profiles are admin-only', () => {
  // The 0021 bug, now pinned.
  it('hides ungrouped profiles from a regular member', () => {
    expect(canAccess(member([]), null)).toBe(false)
    expect(canAccess(member(['g1', 'g2']), null)).toBe(false)
  })

  it('still shows them to a workspace admin', () => {
    expect(canAccess(admin, null)).toBe(true)
  })

  // Closing the bypass: pulling a profile out of its group must REMOVE access,
  // not grant it to everyone.
  it('removing a profile from its group revokes member access', () => {
    const bob = member(['client-a'])
    expect(canAccess(bob, 'client-a')).toBe(true)
    expect(canAccess(bob, null)).toBe(false)
  })
})

describe('per-user grants', () => {
  it('grants only the groups the user holds', () => {
    const bob = member(['client-a'])
    expect(canAccess(bob, 'client-a')).toBe(true)
    expect(canAccess(bob, 'client-b')).toBe(false)
  })

  it('denies everything for a member with no grants', () => {
    expect(canAccess(member([]), 'client-a')).toBe(false)
  })

  // The point of per-user rather than per-role: two people on the SAME role
  // must be able to hold different profile sets.
  it('isolates two members with disjoint grants', () => {
    const alice = member(['client-a'])
    const bob = member(['client-b'])
    expect(canAccess(alice, 'client-a')).toBe(true)
    expect(canAccess(alice, 'client-b')).toBe(false)
    expect(canAccess(bob, 'client-b')).toBe(true)
    expect(canAccess(bob, 'client-a')).toBe(false)
  })

  it('supports membership of several groups', () => {
    const m = member(['g1', 'g2', 'g3'])
    expect(canAccess(m, 'g2')).toBe(true)
    expect(canAccess(m, 'g9')).toBe(false)
  })
})

describe('admin escape hatch', () => {
  it('always sees every group, with or without grants', () => {
    expect(canAccess(admin, 'g1')).toBe(true)
    expect(canAccess(admin, 'anything')).toBe(true)
  })
})

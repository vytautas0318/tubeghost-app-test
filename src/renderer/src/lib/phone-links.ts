// Phone number ↔ browser profile links.
//
// The Phone page lets a user attach one of their TubeProxies numbers to a
// browser profile. The link lives in ghost.phone_number_links (migration 0007),
// NOT on public.phone_numbers — that table is TubeProxies-owned and read
// through a service-role Edge Function, and "profile" is a TubeGhost concept
// that doesn't exist on their side.
//
// Shape (product decisions, 2026-08-05):
//   * ONE profile per number — enforced by a unique index on
//     (workspace_id, phone_number_id), and by upsert here.
//   * WORKSPACE-SCOPED — the link belongs to the workspace, not the buyer.
//
// Only ids are stored. No phone number data is copied ghost-side; that
// duplication is exactly what migration 006 removed.

import { getSupabase } from '@/lib/supabase'

export interface PhoneNumberLink {
  id: string
  workspace_id: string
  phone_number_id: string
  profile_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

function client(): NonNullable<ReturnType<typeof getSupabase>> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')
  return c
}

// All links in a workspace, as phone_number_id → profile_id.
//
// Returns an empty map (never throws) when the read fails — a missing link map
// must degrade to "nothing assigned" rather than break the Phone page.
export async function listPhoneLinks(workspaceId: string): Promise<Map<string, string>> {
  try {
    const { data, error } = await client()
      .from('phone_number_links')
      .select('phone_number_id, profile_id')
      .eq('workspace_id', workspaceId)
    if (error) throw error
    const out = new Map<string, string>()
    for (const r of (data ?? []) as { phone_number_id: string; profile_id: string }[]) {
      out.set(r.phone_number_id, r.profile_id)
    }
    return out
  } catch (e) {
    console.warn('[phone-links] list failed:', (e as Error).message)
    return new Map()
  }
}

// Attach a number to a profile, replacing any existing assignment for that
// number. onConflict targets the unique index, so re-assigning is a single
// round-trip rather than delete-then-insert.
export async function setPhoneLink(
  workspaceId: string,
  phoneNumberId: string,
  profileId: string,
  userId: string | null
): Promise<void> {
  const { error } = await client().from('phone_number_links').upsert(
    {
      workspace_id: workspaceId,
      phone_number_id: phoneNumberId,
      profile_id: profileId,
      created_by: userId
    },
    { onConflict: 'workspace_id,phone_number_id' }
  )
  if (error) throw error
}

// Detach a number from whatever profile it was on.
export async function clearPhoneLink(workspaceId: string, phoneNumberId: string): Promise<void> {
  const { error } = await client()
    .from('phone_number_links')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('phone_number_id', phoneNumberId)
  if (error) throw error
}

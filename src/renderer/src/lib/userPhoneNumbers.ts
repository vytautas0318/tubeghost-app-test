// Data layer for user-added phone numbers (public.user_phone_numbers).
//
// These are numbers a user types into the "Add phone number" dialog — fully
// client-owned (owner-based RLS), separate from the TubeProxies-mirrored
// read-only public.phone_numbers table. RLS pins user_id = auth.uid() on
// every write; we pass user_id/workspace_id so the row keys correctly.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

export interface UserPhoneNumberRow {
  id: string
  user_id: string
  workspace_id: string | null
  phone_number: string
  label: string | null
  created_at: string
  updated_at: string
}

const COLS = 'id, user_id, workspace_id, phone_number, label, created_at, updated_at'

// All numbers visible to the caller (own rows + any workspace rows RLS lets
// through), newest first.
export async function listUserPhoneNumbers(): Promise<UserPhoneNumberRow[]> {
  const { data, error } = await client()
    .from('user_phone_numbers')
    .select(COLS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserPhoneNumberRow[]
}

// Add a number for the caller. Idempotent on (user_id, phone_number): re-adding
// the same number updates its label instead of erroring on the unique index.
export async function addUserPhoneNumber(input: {
  userId: string
  workspaceId: string | null
  phoneNumber: string
  label?: string | null
}): Promise<UserPhoneNumberRow> {
  const { data, error } = await client()
    .from('user_phone_numbers')
    .upsert(
      {
        user_id: input.userId,
        workspace_id: input.workspaceId,
        phone_number: input.phoneNumber,
        label: input.label ?? null
      },
      { onConflict: 'user_id,phone_number' }
    )
    .select(COLS)
    .single()
  if (error) throw error
  return data as UserPhoneNumberRow
}

export async function deleteUserPhoneNumber(id: string): Promise<void> {
  const { error } = await client().from('user_phone_numbers').delete().eq('id', id)
  if (error) throw error
}

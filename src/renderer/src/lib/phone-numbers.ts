// Phone-numbers data layer.
//
// Rows are synced from TubeProxies (keyed to the TubeProxies user id). RLS
// ("phone_numbers.read by email", migration 0039) scopes SELECT to the rows
// whose owner shares the logged-in user's verified JWT email — so a plain
// `select *` returns only the current user's numbers, matched by email rather
// than by auth.uid(). No filter is needed client-side; RLS enforces it.

import { getSupabase } from '@/lib/supabase'

export interface PhoneNumberRow {
  id: string
  user_id: string
  workspace_id: string | null
  phone_number: string
  status: string
  service_type: string | null
  label: string | null
  provisioned_at: string | null
  expires_at: string | null
  released_at: string | null
  created_at: string
  updated_at: string
}

// All phone numbers visible to the current user (email-scoped by RLS).
export async function listMyPhoneNumbers(): Promise<PhoneNumberRow[]> {
  const c = getSupabase()
  if (!c) return []
  const { data, error } = await c
    .from('phone_numbers')
    .select(
      'id, user_id, workspace_id, phone_number, status, service_type, label, provisioned_at, expires_at, released_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PhoneNumberRow[]
}

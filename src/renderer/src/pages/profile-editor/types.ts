import type { ProfileRow } from '@/lib/profiles'

export interface FormState {
  name: string
  group_id: string | null
  notes: string
  tagsInput: string
  tags: string[]
}

export function rowToForm(row: ProfileRow | null): FormState {
  return {
    name: row?.name ?? '',
    group_id: row?.group_id ?? null,
    notes: row?.notes ?? '',
    tagsInput: '',
    tags: row?.tags ?? []
  }
}


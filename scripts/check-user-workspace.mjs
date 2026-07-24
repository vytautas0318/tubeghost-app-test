import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

console.log('Querying public schema as anon (no auth) — should return empty arrays under RLS, not errors:')
for (const t of ['workspaces', 'workspace_members']) {
  const { data, error, count } = await supabase.from(t).select('*', { count: 'exact', head: false }).limit(0)
  console.log(`  ${t}: count=${count} error=${error?.message ?? 'none'}`)
}

// Detailed schema diagnosis. Reports:
//  1. Is the table in PostgREST's known list at all?
//  2. What's the exact error when we query each table?
//  3. Are the SECURITY DEFINER RPCs visible?

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

console.log('Project URL:', url)
console.log('')

// Hit PostgREST's root — it returns JSON-Schema describing every visible table.
// Accept-Profile picks the schema; TubeGhost's tables live in `ghost` since
// the consolidation into the TubeProxies project. Without it this lists
// TubeProxies' public tables instead.
const root = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': 'ghost' }
})
const rootJson = await root.json()
const visibleTables = Object.keys(rootJson?.definitions ?? {})
console.log(`PostgREST sees ${visibleTables.length} visible tables/views:`)
console.log(' ', visibleTables.join(', ') || '(none)')
console.log('')

// Try each of our tables.
const supabase = createClient(url, anon, { db: { schema: 'ghost' } })
for (const t of [
  'workspaces',
  'workspace_members',
  'browser_profiles',
  'groups',
  'extensions',
  'activity_log'
]) {
  const { data, error } = await supabase.from(t).select('*').limit(0)
  console.log(
    `  ${t.padEnd(20)} ${error ? '❌ ' + error.message : `✅ readable (returned ${data?.length ?? 0} rows)`}`
  )
}

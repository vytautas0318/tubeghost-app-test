// Inspect what RLS policies actually exist on the workspaces table.
// Uses pg_catalog views which are world-readable.

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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// pg_policies is in the catalog and exposed via PostgREST in some setups,
// but more reliably we hit it via an RPC. Since we don't have one, we can
// infer policy presence by attempting different queries.

console.log('Anon-readable from PostgREST:')
const { data: policies, error: polErr } = await supabase
  .from('pg_policies')
  .select('schemaname, tablename, policyname, cmd, qual, with_check')
  .eq('tablename', 'workspaces')
  .eq('schemaname', 'public')
console.log({ policies, error: polErr?.message })

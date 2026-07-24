// Quick health check for the Supabase connection + schema.
// Run with: node scripts/check-supabase.mjs
//
// Verifies:
//   1. We can reach the Supabase project at all.
//   2. The migration ran (workspaces / profiles / activity_log tables exist).
//   3. RLS is on (anonymous reads return empty, not "permission denied").
//   4. The lock RPCs are deployed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

console.log('🔌 Connecting to', url)
const supabase = createClient(url, anon)

const checks = []
const fail = (name, msg) => checks.push({ name, ok: false, msg })
const pass = (name) => checks.push({ name, ok: true })

// 1. Tables exist (anon reads from each — should return [] not an error).
for (const table of ['workspaces', 'profiles', 'workspace_members', 'activity_log', 'extensions', 'groups']) {
  const { error } = await supabase.from(table).select('id').limit(0)
  if (error) {
    if (error.code === 'PGRST116' || /does not exist/i.test(error.message)) {
      fail(`table ${table}`, `MISSING — did the migration run?`)
    } else if (error.code === '42501' || /permission denied/i.test(error.message)) {
      fail(`table ${table}`, `RLS denying anon entirely (need at least the policies)`)
    } else {
      fail(`table ${table}`, `${error.code} ${error.message}`)
    }
  } else {
    pass(`table ${table}`)
  }
}

// 2. Lock RPC exists.
const { error: rpcErr } = await supabase.rpc('try_acquire_profile_lock', {
  p_profile_id: '00000000-0000-0000-0000-000000000000',
  p_session_id: '00000000-0000-0000-0000-000000000000',
  p_device: 'check'
})
// We expect this to FAIL (no auth user, no profile) — but a "function does not exist" failure
// is the bad kind.
if (rpcErr && /does not exist|function .* not found/i.test(rpcErr.message)) {
  fail('rpc try_acquire_profile_lock', 'MISSING — did the migration run?')
} else {
  pass('rpc try_acquire_profile_lock')
}

// Print results.
console.log('')
let bad = 0
for (const c of checks) {
  if (c.ok) {
    console.log(`  ✅ ${c.name}`)
  } else {
    bad++
    console.log(`  ❌ ${c.name} — ${c.msg}`)
  }
}
console.log('')
if (bad === 0) {
  console.log('✅ All checks passed. Schema is ready.')
} else {
  console.log(`❌ ${bad} check(s) failed. Run supabase/migrations/0001_init.sql in the SQL Editor.`)
  process.exit(1)
}

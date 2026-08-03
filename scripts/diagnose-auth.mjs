// Sign in (or use existing session via service-role workaround) and check
// what auth.uid() returns from PostgREST's perspective.
// Run: node scripts/diagnose-auth.mjs <email> <password>
//
// If you used Google OAuth and don't have a password, run with no args and
// we'll just print whether anon can call auth.uid() at all.

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
const supabase = createClient(url, anon, { db: { schema: 'ghost' } })

const [email, password] = process.argv.slice(2)
if (email && password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.log('❌ Sign-in failed:', error.message)
    process.exit(1)
  }
  console.log('✅ Signed in as', email)
}

const { data: { user } } = await supabase.auth.getUser()
console.log('Local SDK thinks user is:', user?.id ?? '(none)')

// Direct REST query: what does PostgREST think auth.uid() is?
const { data, error } = await supabase.rpc('user_workspace_ids')
console.log('user_workspace_ids() →', { data, error: error?.message })

// Try inserting a workspace as the current user.
if (user) {
  const { data: ws, error: wsErr } = await supabase
    .from('workspaces')
    .insert({ name: 'diag-test-' + Date.now(), owner_id: user.id })
    .select('id')
    .single()
  if (wsErr) {
    console.log('❌ Workspace insert failed:', wsErr.message)
    console.log('   This means PostgREST sees auth.uid() as NULL or different from', user.id)
  } else {
    console.log('✅ Workspace insert succeeded — id:', ws.id)
    // Cleanup
    await supabase.from('workspaces').delete().eq('id', ws.id)
  }
}

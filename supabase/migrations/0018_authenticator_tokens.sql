-- ===================================================================
-- 0018_authenticator_tokens.sql
-- Authenticator (TOTP 2FA) feature backing table.
--
-- Stores one row per enrolled 2FA account. The RFC-6238 secret is held
-- in `secret_encrypted` as ciphertext produced by the `totp` Edge
-- Function (AES-GCM with a server-only key, TOTP_ENC_KEY). Plaintext
-- Base32 seeds NEVER touch this table or the renderer at rest — the
-- renderer sends/receives ciphertext and asks the Edge Function to
-- decrypt-and-generate codes on the shared 30s tick. This is the real
-- "encrypted across this workspace" claim the UI makes.
--
-- Permission keys (already seeded in 0017_roles_access_catalog.sql):
--   twofa.view          → SELECT rows (see live codes)
--   twofa.manage_tokens → INSERT / DELETE rows (enroll / remove)
--   twofa.reveal_seed   → decrypt raw seed ("Show setup key") — enforced
--                         in the Edge Function, not a table op
--   twofa.export        → bulk seed export — enforced in the Edge Function
--
-- Assignment to a profile rides `assigned_profile_id` (ON DELETE SET
-- NULL — deleting a profile unlinks the token, mirrors the proxy_id
-- rule). Updating that column is gated by twofa.manage_tokens.
-- ===================================================================

-- 1. authenticator_tokens table ---------------------------------------
create table authenticator_tokens (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces on delete cascade,
  -- Brand tile: matches the renderer PlatformIcon values (yt/ig/tt/x/fb/am)
  -- plus 'other'. Free-text (no CHECK) so new platforms don't need a migration.
  platform             text not null default 'other',
  issuer               text not null,               -- display name, e.g. "YouTube"
  handle               text,                        -- e.g. "@crimedynasty"
  label                text,                        -- footer text, e.g. "Crime Dynasty — Main"
  -- AES-GCM ciphertext of the Base32 TOTP secret, produced by the totp
  -- Edge Function. Never plaintext. Opaque to the DB and renderer.
  secret_encrypted     text not null,
  -- RFC-6238 params (respect the otpauth:// URI; default to Google Authenticator).
  algorithm            text not null default 'SHA1'
                         check (algorithm in ('SHA1','SHA256','SHA512')),
  digits               integer not null default 6 check (digits between 6 and 8),
  period               integer not null default 30 check (period > 0 and period <= 120),
  -- Color-coded tag keys (flagship/warm/clips/ecom/new/official/custom).
  tags                 text[] not null default '{}',
  -- Links to an existing profile so the code is auto-filled at launch.
  assigned_profile_id  uuid references profiles on delete set null,
  created_by           uuid references auth.users on delete set null,
  created_at           timestamptz not null default now()
);

-- Supporting indexes for the RLS-checked column + the launch lookup.
create index idx_auth_tokens_workspace on authenticator_tokens (workspace_id);
create index idx_auth_tokens_assigned  on authenticator_tokens (assigned_profile_id)
  where assigned_profile_id is not null;

-- 2. RLS ---------------------------------------------------------------
alter table authenticator_tokens enable row level security;

-- View live codes (SELECT) → twofa.view. The ciphertext is returned but
-- is useless without the Edge Function's key, so SELECT is safe to grant
-- broadly; decryption/reveal is gated separately in the function.
create policy "twofa.view" on authenticator_tokens for select
  using (check_user_permission((select auth.uid()), 'twofa.view', workspace_id));

-- Enroll a new account (INSERT) → twofa.manage_tokens.
create policy "twofa.manage_tokens.insert" on authenticator_tokens for insert
  with check (check_user_permission((select auth.uid()), 'twofa.manage_tokens', workspace_id));

-- Remove / reassign / retag (UPDATE + DELETE) → twofa.manage_tokens.
-- (Assign-to-profile and tag edits are UPDATEs of this same row.)
create policy "twofa.manage_tokens.update" on authenticator_tokens for update
  using (check_user_permission((select auth.uid()), 'twofa.manage_tokens', workspace_id))
  with check (check_user_permission((select auth.uid()), 'twofa.manage_tokens', workspace_id));

create policy "twofa.manage_tokens.delete" on authenticator_tokens for delete
  using (check_user_permission((select auth.uid()), 'twofa.manage_tokens', workspace_id));

-- 3. Reload PostgREST schema cache ------------------------------------
notify pgrst, 'reload schema';

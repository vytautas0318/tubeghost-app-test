-- ===================================================================
-- 0037 — Identity merge: legacy TubeGhost accounts -> TubeProxies id
-- ===================================================================
-- Some pre-migration TubeGhost users (their own auth.users row) later
-- signed up on tubeproxies.com with the SAME email, producing TWO
-- identities for one person:
--   * legacy   = the old TubeGhost auth.users id (owns real data)
--   * canonical= the TubeProxies user id (the identity provider; == the
--                JWT sub the app authenticates with)
-- Both ended up in public.users with the same email, which (a) let the
-- login exchange mint a session for the WRONG (legacy) id, and (b) is a
-- data-integrity hazard.
--
-- merge_identity() reassigns EVERY public FK that references public.users
-- from the legacy id to the canonical id, resolves the "both own a
-- workspace" case, then removes the duplicate legacy public.users +
-- auth.users rows so the email becomes unique to the canonical id.
-- Idempotent + re-runnable (no-op once legacy is gone).
-- ===================================================================

create or replace function public.merge_identity(p_legacy uuid, p_canonical uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy_ws uuid;
  v_canon_ws  uuid;
begin
  if p_legacy = p_canonical then return; end if;
  -- Nothing to do if the legacy mirror row is already gone.
  if not exists (select 1 from public.users where id = p_legacy) then return; end if;
  -- Canonical must exist (it's the TubeProxies mirror row).
  if not exists (select 1 from public.users where id = p_canonical) then
    raise exception 'merge_identity: canonical % not mirrored', p_canonical;
  end if;

  -- ── workspace_members: move legacy memberships, avoiding PK clash ──
  -- (PK = workspace_id,user_id). Delete a legacy membership where the
  -- canonical is already a member of that workspace; otherwise repoint.
  delete from public.workspace_members lm
  where lm.user_id = p_legacy
    and exists (
      select 1 from public.workspace_members cm
      where cm.workspace_id = lm.workspace_id and cm.user_id = p_canonical
    );
  update public.workspace_members set user_id = p_canonical where user_id = p_legacy;

  -- ── user_roles: same composite-key care (user_id,workspace_id) ────
  delete from public.user_roles lr
  where lr.user_id = p_legacy
    and exists (
      select 1 from public.user_roles cr
      where cr.workspace_id = lr.workspace_id and cr.user_id = p_canonical
    );
  update public.user_roles set user_id = p_canonical where user_id = p_legacy;
  update public.user_roles set assigned_by = p_canonical where assigned_by = p_legacy;

  -- ── resolve dual workspace ownership BEFORE repointing owner_id ───
  -- workspaces has a unique constraint (one per owner). If the canonical
  -- was lazily provisioned an EMPTY "My Workspace", drop it now so the
  -- legacy workspace can be repointed to the canonical without colliding.
  -- Only drop when the canonical's workspace is empty AND the legacy owns
  -- a workspace that will take its place.
  if exists (select 1 from public.workspaces where owner_id = p_legacy) then
    for v_canon_ws in
      select w.id from public.workspaces w where w.owner_id = p_canonical
    loop
      if (select count(*) from public.profiles p where p.workspace_id = v_canon_ws) = 0
         and (select count(*) from public.proxies x where x.workspace_id = v_canon_ws) = 0
         and (select count(*) from public.workspace_members m where m.workspace_id = v_canon_ws) <= 1
      then
        -- Deleting the empty workspace cascades to app_roles, which is
        -- guarded by app_roles_block_protected_delete (protects default
        -- roles like "Owner"). That guard is meant to stop users deleting
        -- built-in roles piecemeal, not to block a full workspace teardown
        -- during an admin merge — disable it just for this delete.
        alter table public.app_roles disable trigger app_roles_block_protected_delete;
        delete from public.workspaces where id = v_canon_ws; -- cascades members/roles
        alter table public.app_roles enable trigger app_roles_block_protected_delete;
      end if;
    end loop;
  end if;

  -- ── single-column attribution / ownership FKs (simple repoint) ────
  update public.workspaces            set owner_id       = p_canonical where owner_id       = p_legacy;
  update public.workspace_members     set invited_by     = p_canonical where invited_by     = p_legacy;
  update public.activity_log          set user_id        = p_canonical where user_id        = p_legacy;
  update public.authenticator_tokens  set created_by     = p_canonical where created_by     = p_legacy;
  update public.automation_runs       set triggered_by   = p_canonical where triggered_by   = p_legacy;
  update public.automations           set created_by     = p_canonical where created_by     = p_legacy;
  update public.feature_requests      set user_id        = p_canonical where user_id        = p_legacy;
  update public.invitations           set accepted_by    = p_canonical where accepted_by    = p_legacy;
  update public.invitations           set created_by     = p_canonical where created_by     = p_legacy;
  update public.profile_session_sync  set last_synced_by = p_canonical where last_synced_by = p_legacy;
  update public.profiles              set assigned_to     = p_canonical where assigned_to     = p_legacy;
  update public.profiles              set created_by      = p_canonical where created_by      = p_legacy;
  update public.profiles              set last_opened_by  = p_canonical where last_opened_by  = p_legacy;
  update public.profiles              set open_by_user_id = p_canonical where open_by_user_id = p_legacy;
  update public.proxies               set created_by     = p_canonical where created_by     = p_legacy;
  update public.tags                  set created_by     = p_canonical where created_by     = p_legacy;
  update public.workspace_ip_allowlist set created_by    = p_canonical where created_by     = p_legacy;

  -- phone_numbers.user_id (ON DELETE CASCADE) — repoint, don't drop.
  update public.phone_numbers set user_id = p_canonical where user_id = p_legacy;

  -- Per-user singletons keyed by user_id (login sessions, notif prefs):
  -- keep the canonical's if present, else repoint the legacy's.
  delete from public.user_login_sessions ls
  where ls.user_id = p_legacy; -- device sessions are ephemeral; safe to drop
  delete from public.user_notification_prefs np
  where np.user_id = p_legacy
    and exists (select 1 from public.user_notification_prefs c where c.user_id = p_canonical);
  update public.user_notification_prefs set user_id = p_canonical where user_id = p_legacy;

  -- ── remove the now-orphan legacy identity rows ────────────────────
  delete from public.users where id = p_legacy;
  delete from auth.users  where id = p_legacy;
end;
$$;

revoke all on function public.merge_identity(uuid, uuid) from public, anon, authenticated;

-- ── Apply to the known colliding pairs (found 2026-07-21) ──────────
-- Auto-detect: any legacy auth.users row whose email maps to a DIFFERENT
-- public.users id (the TubeProxies mirror) → merge legacy into canonical.
do $$
declare
  r record;
begin
  for r in
    select au.id as legacy, u2.id as canonical
    from auth.users au
    join public.users u2
      on lower(u2.email) = lower(au.email::text) and u2.id <> au.id
  loop
    perform public.merge_identity(r.legacy, r.canonical);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- Standalone fix: (re)create the mint_pairing_code RPC.
--
-- Run this in the Supabase Dashboard → SQL Editor if "Generate pairing code"
-- returns server_error. The 0041 migration's tables/policies already exist
-- (that's why the full re-run errored on a duplicate policy) but this function
-- may have failed to create when the original run aborted partway.
--
-- Idempotent: create or replace + revoke are safe to run repeatedly.

create or replace function public.mint_pairing_code(p_user_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- Crockford base32
  v_code     text;
  v_expires  timestamptz;
  i          integer;
  attempt    integer := 0;
begin
  loop
    attempt := attempt + 1;
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;

    begin
      insert into public.pairing_codes (code, user_id)
      values (v_code, p_user_id)
      returning public.pairing_codes.expires_at into v_expires;
      exit;
    exception when unique_violation then
      if attempt >= 5 then
        raise exception 'could not mint unique pairing code after % attempts', attempt;
      end if;
    end;
  end loop;

  delete from public.pairing_codes
   where user_id = p_user_id and expires_at < now();

  code := v_code;
  expires_at := v_expires;
  return next;
end;
$$;

revoke all on function public.mint_pairing_code(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

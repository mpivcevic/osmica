-- 017 — Stage C3a + C3b: owner-side unlink, and linked state the owner can see
--
-- Apply to BOTH projects. Nothing here is dev-specific.
--
-- WHY THIS IS A GATE AND NOT A FEATURE
--
-- Today a waiter who clears their browser data is inconvenienced: the session
-- is gone, but PIN login still gets them in. C3 moves the PIN check onto the
-- device and C4 deletes login_waiter_by_pin and verify_waiter_pin outright.
-- After that, a cleared browser means no session, no local hash, and no PIN
-- path — and a fresh invite CANNOT rescue them, because link_waiter_to_auth
-- requires auth_user_id IS NULL (014:71) and theirs is set. That is a permanent
-- lockout with no self-service path and no owner-facing fix.
--
-- owner_unlink_waiter() is that fix. It must exist, and its round trip must be
-- proven on dev, before C3e changes any behaviour.
--
-- C3b ships alongside it because the C3 gate — "every active waiter is linked"
-- — is otherwise readable only in SQL. The admin panel's "Aktivan/na" is
-- joined_at, which is set the moment anyone picks a PIN and is never cleared;
-- whether a waiter can WRITE depends on auth_user_id, which the panel has never
-- displayed. See trap 11 in supabase/migrations/README.md.

BEGIN;

-- ── C3a — release a waiter's device binding ────────────────────────────────
--
-- SECURITY DEFINER, and the ownership check inside is what authorises — not the
-- role. `authenticated` is self-service since anonymous sign-ins were enabled,
-- so a grant to that role is a grant to anybody (trap 6, and the reason 008 had
-- to drop set_waiter_pin).
--
-- search_path includes `extensions` for the same reason 014 does: no crypt()
-- here today, but pinning to `public, pg_temp` alone is how a later edit
-- rediscovers the happy-path-only failure (trap 2).
CREATE OR REPLACE FUNCTION public.owner_unlink_waiter(p_waiter_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cafe_id uuid;
  v_token   text;
BEGIN
  SELECT cafe_id INTO v_cafe_id
  FROM public.waiters
  WHERE id = p_waiter_id;

  -- "No such waiter" and "not your waiter" answer identically and on purpose:
  -- distinguishing them would confirm to a stranger that a given uuid names a
  -- real waiter in somebody else's cafe. Same conflation as 014's
  -- invalid_token. Raising rather than returning a sentinel matches
  -- owner_list_waiters, so the client has one shape to handle for both.
  IF v_cafe_id IS NULL OR NOT public.owns_cafe(v_cafe_id) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  UPDATE public.waiters
  SET
    -- Releases the binding, so a new device can claim this row. This is the
    -- one line that makes link_waiter_to_auth's `auth_user_id IS NULL` pass
    -- again (trap 13).
    auth_user_id = NULL,
    -- Sends the next invite down the `setup` branch, which is the only branch
    -- that can establish a NEW PIN. After C3e the old PIN lives only on the
    -- device that is gone, so `recover` would ask for something the waiter
    -- cannot produce.
    joined_at    = NULL,
    -- Until C4 drops the column. The old hash authenticates a PIN that nobody
    -- has any more.
    pin_hash     = NULL,
    -- The old link dies with the old binding, so a forwarded copy of it is
    -- inert from here.
    invite_token = gen_random_uuid()::text
  WHERE id = p_waiter_id
  RETURNING invite_token INTO v_token;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_unlink_waiter(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_unlink_waiter(uuid) FROM anon, PUBLIC;


-- ── C3b — surface the binding in the owner's roster ────────────────────────
--
-- DROP then CREATE, not CREATE OR REPLACE: changing a function's RETURNS TABLE
-- signature is not a replace, and OR REPLACE fails with "cannot change return
-- type of existing function". Safe inside this transaction — no window where
-- the function is missing to a concurrent caller.
--
-- Returns `linked boolean`, not auth_user_id itself. The client needs to render
-- two states, not to hold a uid, and shipping the uid would put a second
-- account identifier in the browser for no purpose.
DROP FUNCTION IF EXISTS public.owner_list_waiters(uuid);

CREATE FUNCTION public.owner_list_waiters(p_cafe_id uuid)
RETURNS TABLE (
  id           uuid,
  cafe_id      uuid,
  name         text,
  color        text,
  pattern      jsonb,
  vacations    jsonb,
  joined_at    timestamptz,
  created_at   timestamptz,
  phone        text,
  -- text, not uuid. dev/013 aligned dev to production by changing this column
  -- uuid -> text, and 014 writes gen_random_uuid()::text into it. Declaring
  -- uuid here compiles fine and fails only when the function is first called,
  -- with a structure mismatch.
  invite_token text,
  -- New in 017. Two states, two different fixes: joined_at answers "has this
  -- person ever chosen a PIN", linked answers "can this person write".
  linked       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- owns_cafe() already excludes anonymous sessions and non-owners. Raising
  -- rather than returning zero rows keeps a caller from reading an empty result
  -- as "this cafe has no staff".
  IF NOT public.owns_cafe(p_cafe_id) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  RETURN QUERY
  SELECT w.id, w.cafe_id, w.name, w.color, w.pattern, w.vacations,
         w.joined_at, w.created_at, w.phone, w.invite_token,
         w.auth_user_id IS NOT NULL
  FROM public.waiters w
  WHERE w.cafe_id = p_cafe_id
  ORDER BY w.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_list_waiters(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_list_waiters(uuid) FROM anon, PUBLIC;

COMMIT;


-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
-- 1. Both functions exist with the search_path pin actually applied. Trap 3:
--    a saved query in the SQL editor can re-apply older text and still report
--    success, so read it back rather than trusting the green box.
--
--      select proname, proconfig, prosecdef
--      from pg_proc
--      where proname in ('owner_unlink_waiter','owner_list_waiters');
--      -- expect: both prosecdef = true,
--      --         both proconfig = {search_path=public, extensions, pg_temp}
--
-- 2. Neither is reachable without a session. With the publishable key only:
--
--      POST /rest/v1/rpc/owner_unlink_waiter {"p_waiter_id":"<any uuid>"} -> 401/404
--
--    Anything that looks like an answer rather than a refusal means the anon
--    revoke did not take.
--
-- 3. The roster now carries the binding:
--
--      select name,
--             joined_at    is not null as activated,
--             auth_user_id is not null as linked
--      from public.waiters order by name;
--
--    `activated` without `linked` is the state the admin panel has been hiding.
--
-- 4. THE REAL TEST is the round trip and it needs a browser. Steps 4 and 5 of
--    TaskList_2026-08-22.md: link a waiter, unlink them, confirm linked = false,
--    then complete the new invite in a clean profile and confirm linked = true
--    again. C3 does not start until that passes, and C4 is irreversible without
--    it.

-- 018 — Stage C4: delete the PIN login surface
--
-- Apply to BOTH projects. Nothing here is dev-specific.
--
-- 🔴 IRREVERSIBLE, AND GATED. Do not run this until all five C3f checks in
-- TaskList_2026-08-23.md have passed, on the project you are about to run it
-- against. Check 4 in particular — a waiter unlinked by the owner completing a
-- fresh invite and successfully writing — because this file removes the last
-- fallback. If recovery is broken when 018 runs, it is broken permanently, and
-- one cleared browser costs a staff member their access for good.
--
-- WHAT GOES, AND WHY EACH ONE
--
-- login_waiter_by_pin(cafe_id, pin) — the enumeration oracle. Given a café and
--   four digits it returned a waiter row, which is to say it told anyone
--   holding the publishable key WHICH person they had just become, in at most
--   10,000 tries. No amount of rate limiting makes that a good shape; 009 only
--   made it slow.
-- verify_waiter_pin(waiter_id, pin) — the second oracle. Narrower (you must
--   already know the waiter) but the same thing: a four-digit credential
--   checked over the network by anybody who asks.
-- is_pin_locked / register_pin_failure / clear_pin_failures / pin_attempts —
--   009's rate limiter. It exists only to protect those two functions. With
--   them gone it protects nothing, and a table that nothing writes is a table
--   nobody will remember the meaning of.
-- set_waiter_pin_by_token(token, pin) — wrote the server-side hash. v4.42 stops
--   calling it: joined_at now comes from link_waiter_to_auth, which sets it
--   with COALESCE(joined_at, now()) (014:88).
-- waiters.pin_hash — nothing reads it and nothing writes it after v4.42.
--
-- WHAT REPLACES IT: nothing, on the server. The PIN is compared on the device
-- against a PBKDF2 hash in localStorage (v4.42), and the credential that
-- actually authenticates a waiter is the anonymous Supabase session bound to
-- their row by 014. See osmica_stage_c_plan.md, "Be honest about what the PIN
-- then is".
--
-- ORDER MATTERS: owner_unlink_waiter is rewritten FIRST, because it assigns
-- pin_hash = NULL. Postgres does not parse function bodies when a column is
-- dropped, so leaving it alone would not fail here — it would fail at 3am the
-- first time an owner pressed 🔓, with "column pin_hash does not exist" and no
-- migration in sight to blame. See trap 15 in supabase/migrations/README.md.

BEGIN;

-- ── The gate, enforced ─────────────────────────────────────────────────────
--
-- A waiter with joined_at set and auth_user_id null is someone who chose a PIN
-- and holds no device binding. Before this file they are inconvenienced: PIN
-- login still works and they are simply read-only. After it they cannot get
-- into the app at all, and the only way back is the owner's 🔑 reset followed
-- by a fresh invite — which they must be given BEFORE this runs, not after,
-- because nothing about their situation announces itself.
--
-- If this raises, that is the file working. Do not comment it out. Fix the
-- rows: either link them (send the invite, claim it on their phone) or clear
-- them with the 🔑 button in the admin panel, which nulls joined_at and hands
-- back a fresh link. Then run 018 again.
--
-- On dev this will fire for the deliberately-unlinked test rows. They are not
-- an exception to the rule; they are the rule, on rows nobody minds resetting.
DO $$
DECLARE
  v_stranded text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_stranded
  FROM public.waiters
  WHERE joined_at IS NOT NULL AND auth_user_id IS NULL;

  IF v_stranded IS NOT NULL THEN
    RAISE EXCEPTION
      'C4 gate: these waiters have a PIN and no linked device, and 018 would lock them out permanently: %', v_stranded;
  END IF;
END;
$$;

-- ── owner_unlink_waiter, without pin_hash ──────────────────────────────────
--
-- Identical to 017 apart from the removed assignment and this comment. Same
-- signature, so CREATE OR REPLACE is correct here — unlike owner_list_waiters
-- in 017, which changed its RETURNS TABLE and needed DROP + CREATE (trap 13).
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
  -- real waiter in somebody else's cafe.
  IF v_cafe_id IS NULL OR NOT public.owns_cafe(v_cafe_id) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  UPDATE public.waiters
  SET
    -- Releases the binding so a new device can claim this row — the line that
    -- makes link_waiter_to_auth's `auth_user_id IS NULL` pass again.
    auth_user_id = NULL,
    -- Sends the next invite down the branch that sets a new PIN. Since v4.42
    -- the invite screen routes on whether THIS device holds a local hash rather
    -- than on joined_at, so this no longer decides the branch — but it is still
    -- what the owner's panel reads as "activated", and a released device is not
    -- an activated one.
    joined_at    = NULL,
    -- The old link dies with the old binding, so a forwarded copy is inert.
    invite_token = gen_random_uuid()::text
  WHERE id = p_waiter_id
  RETURNING invite_token INTO v_token;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_unlink_waiter(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_unlink_waiter(uuid) FROM anon, PUBLIC;


-- ── The two oracles ────────────────────────────────────────────────────────
--
-- Signatures from 009. IF EXISTS so this file is idempotent and so it survives
-- being run against a project where one of them was already gone.
DROP FUNCTION IF EXISTS public.login_waiter_by_pin(uuid, text);
DROP FUNCTION IF EXISTS public.verify_waiter_pin(uuid, text);

-- ── The rate limiter that existed only to protect them ─────────────────────
DROP FUNCTION IF EXISTS public.is_pin_locked(uuid);
DROP FUNCTION IF EXISTS public.register_pin_failure(uuid);
DROP FUNCTION IF EXISTS public.clear_pin_failures(uuid);
DROP TABLE    IF EXISTS public.pin_attempts;

-- ── The writer ─────────────────────────────────────────────────────────────
--
-- 007's signature. The older, unauthenticated set_waiter_pin(uuid, text) went
-- in 008 on production and in dev/013 on dev; the IF EXISTS covers any project
-- where it somehow survived.
DROP FUNCTION IF EXISTS public.set_waiter_pin_by_token(text, text);
DROP FUNCTION IF EXISTS public.set_waiter_pin(uuid, text);

-- ── The column ─────────────────────────────────────────────────────────────
--
-- Last, so that every function that referenced it has already gone or been
-- rewritten above. 002 and 005's column-level grants on pin_hash disappear with
-- it; there is nothing left to revoke.
ALTER TABLE public.waiters DROP COLUMN IF EXISTS pin_hash;

COMMIT;


-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
-- 1. Nothing PIN-shaped is left in the schema. This is the query to trust, not
--    the green box — trap 3, a saved query re-applies its own older text.
--
--      select proname from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and proname ilike '%pin%'
--      order by proname;
--      -- expect: zero rows
--
--      select column_name from information_schema.columns
--      where table_schema = 'public' and table_name = 'waiters'
--      order by column_name;
--      -- expect: no pin_hash
--
--      select to_regclass('public.pin_attempts');   -- expect: null
--
-- 2. The oracle is gone from OUTSIDE, which is the only place it mattered.
--    With the publishable key and no session — dev's key is in osmica.html
--    around line 1118, production's beside it:
--
--      curl -i -X POST '<BASE>/rest/v1/rpc/login_waiter_by_pin' \
--        -H 'apikey: <PUBLISHABLE KEY>' -H 'Content-Type: application/json' \
--        -d '{"p_cafe_id":"00000000-0000-0000-0000-000000000000","p_pin":"1234"}'
--
--    ✅ 404 with PGRST202, "Could not find the function ... in the schema
--       cache". PostgREST will not admit it exists.
--    ❌ Any 200. ❌ Any 401/42501 — that is "permission denied for function",
--       which means the function is still there and only the grant is stopping
--       the caller. This file is about the function not existing.
--
-- 3. owner_unlink_waiter still works, from the app rather than from SQL. Press
--    🔓 on a linked waiter in the admin panel and confirm a new link appears.
--    The SQL editor cannot catch the failure this step exists for: it runs as
--    superuser and the function would break only on the pin_hash assignment,
--    which is exactly what was removed above.
--
-- 4. The roster reads clean:
--
--      select name,
--             joined_at    is not null as activated,
--             auth_user_id is not null as linked
--      from public.waiters order by name;
--
--    Every row should now be linked=true or activated=false. Anything else
--    means the gate at the top was bypassed.

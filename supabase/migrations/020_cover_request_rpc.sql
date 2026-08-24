-- 020 — Stage D, part 2: a waiter stops writing to shift_requests directly.
--
-- 015:222-231 left a note against sr_waiter_update and deferred it here:
--
--     -- Covering someone else's shift is by definition a write to another
--     -- waiter's row, so this cannot be narrowed to "own rows". It is bounded
--     -- by cafe instead. RLS cannot restrict WHICH columns an UPDATE touches,
--     -- so a waiter can still write note or status on any request in their
--     -- cafe. Closing that needs either a SECURITY DEFINER cover_request() RPC
--     -- or a column-level UPDATE grant, and belongs with the client change
--     -- that would accompany it — see Stage D.
--
-- That is the last waiter-side write hole. Today any linked waiter can PATCH
-- any request in their cafe: rewrite somebody else's note, flip a request they
-- did not make to 'approved', or mark it 'rejected'. Nothing in the app offers
-- those, and nothing in the database refuses them.
--
-- The RPC is the right half of the choice. A column-level UPDATE grant on
-- (covered_by, status) would still let a waiter set status to 'approved' — the
-- grant controls which columns, never which values — so it closes the smaller
-- half of the hole and leaves self-approval open.
--
-- The whole of the waiter's write surface is two calls: raise a request
-- (osmica.html:2796, an INSERT, already correctly bounded by sr_waiter_insert)
-- and offer to cover one (osmica.html:2939). Only the second needs this.

-- ── ORDER ──────────────────────────────────────────────────────────────────
--
-- This file is purely additive. It creates cover_request() and nothing else, so
-- it is safe to run at any time: the v4.42 client is not calling it yet, and
-- nothing here changes what the old client can already do.
--
-- Its other half is 022_drop_sr_waiter_update.sql, which drops the policy the
-- v4.42 client uses to cover a shift. That one has a gate on it. Per project:
--
--     020  ->  deploy v4.43  ->  confirm v4.43 is being SERVED  ->  022
--
-- Run 022 early and every waiter still on the old file loses the cover button
-- until they hard-reload. Two files rather than two blocks in one file is what
-- makes that order enforceable, instead of depending on pasting the right
-- region of a single paste.


BEGIN;

-- Returns the request id on success and NULL when nothing matched, which the
-- client renders as WRITE_REFUSED_MSG. NULL rather than an exception because a
-- lost race — someone else covered it two seconds ago — is an ordinary outcome,
-- not a fault. The two states that ARE faults raise, so they reach the client
-- as an error with a code rather than as silence: trap 8 in the README is
-- exactly this distinction, and it has already cost this project a false
-- "takeover confirmed".
--
-- RETURNS uuid rather than RETURNS TABLE on purpose: an OUT parameter named
-- `id` or `status` collides with the column of the same name inside the UPDATE
-- and fails at call time with "column reference is ambiguous", never at
-- creation time.
--
-- search_path is public, pg_temp — no extensions needed here. Trap 2 only bites
-- functions that reach for crypt()/gen_salt().
CREATE OR REPLACE FUNCTION public.cover_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_waiter uuid := public.current_waiter_id();
  v_cafe   uuid := public.current_waiter_cafe();
  v_id     uuid;
BEGIN
  -- An owner has no business here, and this is the one place it matters: the
  -- owner's own session would otherwise satisfy nothing below and return a
  -- silent NULL, which reads as "somebody beat you to it" rather than as
  -- "wrong account".
  IF NOT public.is_anon_session() THEN
    RAISE EXCEPTION 'owner_session';
  END IF;

  -- No binding means this device was never linked, or was released by the
  -- owner. Distinct from a lost race, and the client already has a sentence for
  -- it: "Ovaj uređaj nije povezan s tvojim računom."
  IF v_waiter IS NULL THEN
    RAISE EXCEPTION 'not_linked';
  END IF;

  -- Every value the write depends on comes from the binding, not from the
  -- caller. p_request_id is the only thing the client supplies, and each of the
  -- three conditions below has to hold for it:
  --
  --   cafe_id   = v_cafe      -- not another cafe's request
  --   status    = 'open'      -- not one already covered, approved or rejected;
  --                              this is also what makes a second call a no-op
  --   waiter_id <> v_waiter   -- you cannot cover your own day off
  --
  -- covered_by and status are set here, so a waiter cannot reach note,
  -- approved_by, date or shift at all. That is the part RLS could not express.
  UPDATE public.shift_requests
     SET covered_by = v_waiter,
         status     = 'pending_approval'
   WHERE id        = p_request_id
     AND cafe_id   = v_cafe
     AND status    = 'open'
     AND waiter_id <> v_waiter
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.cover_request(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cover_request(uuid) FROM anon, PUBLIC;

COMMIT;


-- ── VERIFY ─────────────────────────────────────────────────────────────────
--
-- 1. The function exists, is DEFINER, and is pinned:
--
--      select proname, prosecdef, proconfig
--      from pg_proc where proname = 'cover_request';
--      -- expect: prosecdef = true, proconfig = {"search_path=public, pg_temp"}
--
--    Trap 3: if you ever re-run a corrected version of this file through a
--    SAVED QUERY, the editor re-applies the old text and says Success. This
--    query is how you find out. Paste the file; never a saved query.
--
-- 2. anon cannot call it:
--
--      curl -s -o /dev/null -w '%{http_code}\n' \
--        -X POST "$BASE/rest/v1/rpc/cover_request" \
--        -H "apikey: $KEY" -H 'Content-Type: application/json' \
--        -d '{"p_request_id":"00000000-0000-0000-0000-000000000000"}'
--      -- expect: 401. A 200 means the REVOKE did not take.
--
--    Trap 16 in reverse: here 401 IS the pass, because this function is being
--    fenced rather than deleted. 018's probes wanted 404, a different question.
--
-- 3. THE REAL TEST needs a browser and belongs in the task list: a waiter covers
--    a shift through the RPC and it sticks across a reload — step 4.4.

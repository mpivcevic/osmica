-- 022 — Stage D, part 2b: drop sr_waiter_update.
--
-- The other half of 020. 020 created cover_request(); this drops the policy it
-- replaces. They are separate files because they are separated in TIME, by a
-- client deploy — and a gate that depends on pasting the right region of one
-- file is not a gate.
--
-- ⚠️ DO NOT RUN THIS UNTIL v4.43 IS THE FILE BEING SERVED ON THIS PROJECT.
--
-- Confirm that on the deployed URL, not on disk: the version pill under the
-- logo (osmica.html:572) must read v4.43. On production that means a hard
-- reload of https://mpivcevic.github.io/... after Pages has finished building.
-- A build that has not finished looks exactly like one that has.
--
-- WHY. Until this runs, sr_waiter_update lets any linked waiter PATCH any
-- request in their cafe: rewrite somebody else's note, flip a request they did
-- not make to 'approved', mark one 'rejected'. RLS cannot restrict WHICH
-- columns an UPDATE touches, which is why the fix had to be an RPC, and why
-- 015:222-231 deferred it to Stage D instead of narrowing the policy.
--
-- WHAT BREAKS IF YOU RUN IT EARLY. The v4.42 client covers a shift with a
-- direct UPDATE. With the policy gone and the client not yet calling
-- cover_request(), covering fails for anyone still on the old file until they
-- hard-reload — and per trap 8 the refused UPDATE returns 204 with no error, so
-- the app renders a swap the database never recorded. That silent version is
-- the reason for the gate.

BEGIN;

-- With cover_request() in place this policy grants nothing the app uses, and
-- everything it does grant is unwanted: any column of any request in the cafe.
-- Dropping it leaves the waiter with exactly one write policy on this table,
-- sr_waiter_insert, plus the RPC.
--
-- Note what is NOT revoked: the table-level UPDATE grant on shift_requests
-- stays with `authenticated`, because the owner holds that role too and
-- handleApproval (osmica.html:2987) needs it. RLS, not the grant, is what
-- separates them — this is trap 6, and VERIFY 3 of 015 says the same thing.
DROP POLICY IF EXISTS sr_waiter_update ON public.shift_requests;

COMMIT;


-- ── VERIFY ─────────────────────────────────────────────────────────────────
--
-- 1. Three policies on shift_requests, and sr_waiter_update is not one:
--
--      select tablename, policyname, cmd from pg_policies
--      where schemaname = 'public' and tablename = 'shift_requests'
--      order by policyname;
--      -- expect exactly: sr_owner_all ALL, sr_waiter_insert INSERT,
--      --                 sr_waiter_read SELECT
--
-- 2. Covering a shift must STILL WORK, through the RPC. If it breaks here the
--    RPC is not being called and the browser is on a cached v4.42. Hard reload.
--
-- 3. THE HOSTILE WRITE, from the waiter's own browser — the check the SQL
--    editor cannot do, and the only one that proves the hole is shut:
--
--      const rid = STATE.requests.find(r => r.waiterId !== currentWaiter().id)?.id;
--      await sb.from('shift_requests').update({ note: 'pwned' }).eq('id', rid).select();
--      -- expect: { data: [], error: null }
--
--    Trap 8: the EMPTY ARRAY is the proof, not the absence of an error. A 204
--    with no error means "no rows matched", which is exactly what a refusal
--    looks like. Always .select() / Prefer: return=representation.

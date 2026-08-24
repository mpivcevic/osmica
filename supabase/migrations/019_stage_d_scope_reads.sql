-- 019 — Stage D, part 1: reads become cafe-scoped, and `anon` loses SELECT.
--
-- 015 enabled RLS on all four tables and wrote the owner and waiter policies,
-- but deliberately left reads wide:
--
--     CREATE POLICY cafes_read ON public.cafes
--       FOR SELECT TO anon, authenticated USING (true);
--
-- and the same for waiters, shift_requests and date_schedules. That was not an
-- oversight — see 015:158-162. Until C4, a waiter with no session had to render
-- the cafe name and the roster BEFORE authenticating, because the login screen
-- was a cafe picker and a PIN keypad. Anonymous reads were load-bearing.
--
-- C4 (018) removed that requirement. With no session the app now offers nothing
-- but "ask the owner for a link": the invite screen resolves everything it shows
-- through claim_invite(), a SECURITY DEFINER RPC that takes the token as its
-- credential and never touches a table from the client. Nothing else in the app
-- reads a table without a session.
--
-- So the four `*_read` policies and the residual anon SELECT grants are now the
-- entire remaining anonymous exposure. Measured on production, 24 Aug 2026,
-- with the publishable key and no session:
--
--     cafes            200, 1 row    — including owner_id
--     waiters          200, 8 of 11 columns for all seven staff
--     shift_requests   200, 4 rows   — whole table
--     date_schedules   200, 385 rows — whole table
--
-- This file closes all four.
--
-- REQUIRES NO CLIENT CHANGE ON PRODUCTION. Every read the app performs happens
-- under a session: the owner's password session, or a waiter's anonymous
-- session bound to their row by 014. Both are covered below.
--
-- ONE THING BREAKS, AND IT IS DEV-ONLY: the dev identity switcher
-- (osmica.html:4069-4076) enumerates cafes and then waiters with no session at
-- all — that is the point of it, it is what you use from a fresh device before
-- you are anybody. It goes blank after this file. dev/021 gives it a
-- SECURITY DEFINER read of its own, on the dev project only. The switcher never
-- runs on production: osmica.html:3938 short-circuits on IS_PROD_HOST.

BEGIN;

-- ── anon loses SELECT on all four tables ───────────────────────────────────
--
-- PUBLIC is included for the same reason 005 and 006 included it: a grant there
-- leaks straight through to anon, and revoking from anon alone would leave the
-- hole open with no error to show for it.
--
-- Trap 1 in the README is about the OTHER direction — a column-level REVOKE
-- cannot subtract from a table-level grant. This is the direction that does
-- work: "when revoking privileges on a table, the corresponding column
-- privileges (if any) are automatically revoked on each column of the table as
-- well." So the eight-column grant 006 left on `waiters` goes with the line
-- below. VERIFY 2 proves it rather than trusting it, and the explicit column
-- revoke after it is belt and braces for a project that has been burned here
-- before: redundant if the documented behaviour holds, harmless if it does not.

REVOKE SELECT ON public.cafes          FROM anon, PUBLIC;
REVOKE SELECT ON public.waiters        FROM anon, PUBLIC;
REVOKE SELECT ON public.shift_requests FROM anon, PUBLIC;
REVOKE SELECT ON public.date_schedules FROM anon, PUBLIC;

REVOKE SELECT (
  id, cafe_id, name, color, pattern, vacations, joined_at, created_at
) ON public.waiters FROM anon, PUBLIC;

-- INSERT/UPDATE/DELETE were revoked from anon by 003 and the residual
-- TRUNCATE/TRIGGER/REFERENCES by 011. Nothing to repeat here.


-- ── The four blanket read policies go ──────────────────────────────────────
--
-- Trap 9: permissive policies combine with OR, so leaving any one of these in
-- place makes everything below it decorative. They are dropped, not narrowed.

DROP POLICY IF EXISTS cafes_read   ON public.cafes;
DROP POLICY IF EXISTS waiters_read ON public.waiters;
DROP POLICY IF EXISTS sr_read      ON public.shift_requests;
DROP POLICY IF EXISTS ds_read      ON public.date_schedules;

-- Idempotent: this file may be re-applied after a correction.
DROP POLICY IF EXISTS cafes_waiter_read   ON public.cafes;
DROP POLICY IF EXISTS waiters_waiter_read ON public.waiters;
DROP POLICY IF EXISTS sr_waiter_read      ON public.shift_requests;
DROP POLICY IF EXISTS ds_waiter_read      ON public.date_schedules;


-- ── Replacements: waiters read their own cafe, and nothing else ────────────
--
-- The owner needs no read policy here. `cafes_owner_all`, `waiters_owner_all`,
-- `sr_owner_all` and `ds_owner_all` from 015 are FOR ALL, which includes
-- SELECT, and they already scope to owns_cafe(). Adding a second owner read
-- policy would be one more permissive branch to reason about for no gain.
--
-- current_waiter_cafe() (015:76-84) is SECURITY DEFINER, so a policy on
-- `waiters` that calls it does not re-enter the RLS being evaluated. It returns
-- NULL for the owner, for `anon`, and for an anonymous session that has not
-- linked yet — and `cafe_id = NULL` is NULL, not true, so all three fail these
-- policies and fall through to whatever else applies to them. For the owner
-- that is the *_owner_all policies. For the other two it is nothing.
--
-- These do NOT also test is_anon_session(), and that is deliberate. Being bound
-- in waiters.auth_user_id is already the stronger statement: link_waiter_to_auth
-- refuses an owner session (014, and the client's 'owner_session' branch at
-- osmica.html:1821), so no password session can appear in that column. Adding
-- the claim test would gate every waiter read on a second condition that can
-- only ever be true, i.e. one more way for a future auth change to break reads
-- silently.

CREATE POLICY cafes_waiter_read ON public.cafes
  FOR SELECT TO authenticated
  USING (id = public.current_waiter_cafe());

CREATE POLICY waiters_waiter_read ON public.waiters
  FOR SELECT TO authenticated
  USING (cafe_id = public.current_waiter_cafe());

CREATE POLICY sr_waiter_read ON public.shift_requests
  FOR SELECT TO authenticated
  USING (cafe_id = public.current_waiter_cafe());

CREATE POLICY ds_waiter_read ON public.date_schedules
  FOR SELECT TO authenticated
  USING (cafe_id = public.current_waiter_cafe());

COMMIT;


-- ── VERIFY ─────────────────────────────────────────────────────────────────
--
-- Run 1-3 in the SQL editor. Run 4 from a terminal, and treat 4 as the only one
-- that actually answers the question — the SQL editor replies as a superuser
-- and therefore cannot tell you what a stranger reaches.
--
-- 1. Exactly ten policies, none of them mentioning anon:
--
--      select tablename, policyname, roles, cmd
--      from pg_policies where schemaname = 'public'
--      order by tablename, policyname;
--
--    expect, and nothing else:
--      cafes           cafes_owner_all       {authenticated}  ALL
--      cafes           cafes_waiter_read     {authenticated}  SELECT
--      date_schedules  ds_owner_all          {authenticated}  ALL
--      date_schedules  ds_waiter_read        {authenticated}  SELECT
--      shift_requests  sr_owner_all          {authenticated}  ALL
--      shift_requests  sr_waiter_insert      {authenticated}  INSERT
--      shift_requests  sr_waiter_read        {authenticated}  SELECT
--      shift_requests  sr_waiter_update      {authenticated}  UPDATE
--      waiters         waiters_owner_all     {authenticated}  ALL
--      waiters         waiters_waiter_read   {authenticated}  SELECT
--
--    Any row with {anon} in roles, or any extra FOR ALL policy, means trap 9
--    applies and everything above it is inert. sr_waiter_update is expected
--    here and leaves in 020.
--
-- 2. anon holds no column privilege on waiters — this is the trap-1 check:
--
--      select column_name from information_schema.column_privileges
--      where table_name = 'waiters' and grantee = 'anon';
--      -- expect: zero rows
--
-- 3. anon holds no table privilege on any of the four:
--
--      select table_name, privilege_type
--      from information_schema.role_table_grants
--      where table_schema = 'public' and grantee = 'anon'
--      order by table_name, privilege_type;
--      -- expect: zero rows
--
-- 4. From outside, with the publishable key and no session. Dev shown; for
--    production swap in the two values from osmica.html:1113-1114.
--
--      BASE='https://simavghwjnqytcyeunto.supabase.co'
--      KEY='sb_publishable_xOx4POsl9coB1utDMHlHAw_h1q4oxWA'
--      for t in cafes date_schedules shift_requests; do
--        printf '%-16s ' "$t"
--        curl -s -o /dev/null -w '%{http_code}\n' "$BASE/rest/v1/$t?select=id" -H "apikey: $KEY"
--      done
--      for q in id name color pattern vacations joined_at cafe_id created_at; do
--        printf 'waiters.%-12s ' "$q"
--        curl -s -o /dev/null -w '%{http_code}\n' "$BASE/rest/v1/waiters?select=$q" -H "apikey: $KEY"
--      done
--
--    expect 401 on every line, all eleven.
--
--    Probe waiters COLUMN BY COLUMN, never with select=*. A star query fails as
--    soon as it reaches one blocked column, so it returns 401 against a table
--    that is wide open on every other column — it reported this table closed
--    for the whole of Stage C while it was returning the full roster.
--
--    Control, so that eleven 401s mean "the grants went" and not "the key is
--    dead or the project is down":
--
--      curl -s -o /dev/null -w '%{http_code}\n' \
--        -X POST "$BASE/rest/v1/rpc/claim_invite" \
--        -H "apikey: $KEY" -H 'Content-Type: application/json' \
--        -d '{"p_token":"not-a-real-token"}'
--      -- expect: 200 with a body of []. The invite path must survive this file.
--
-- 5. THE REAL TEST needs a browser, because a policy that is too tight and a
--    policy that is correct look identical from outside. See the task list:
--    owner opens the admin panel, waiter opens the app and sees the roster and
--    the schedule, a fresh invite completes end to end.

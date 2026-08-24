-- dev/021 — Give the dev identity switcher a read of its own. DEV ONLY.
--
-- ⚠️ DO NOT RUN THIS ON osmica-production. It is a deliberate, narrow
-- reintroduction of anonymous roster reads, and it is defensible only because
-- the dev project holds seeded fake staff (dev/011) and the switcher is
-- physically absent from production: osmica.html:3938 returns before a single
-- line of it runs when the host is mpivcevic.github.io.
--
-- WHY IT IS NEEDED. The switcher (osmica.html:4060-4080) lists the cafe's
-- waiters so you can become one without clearing browser data and burning an
-- invite link for every test. It does that with two table reads and NO SESSION,
-- because "no session" is exactly the state it exists to get you out of. 019
-- revokes anon SELECT, so both reads return 401 and the switcher renders empty.
--
-- WHY NOT JUST LOG IN FIRST. Because the switcher's job is to hand you a waiter
-- identity on a device that has none, and the roster is the list you pick from.
-- Requiring a session to see the list means the tool only works once you no
-- longer need it.
--
-- WHAT THIS DELIBERATELY DOES NOT EXPOSE: phone, invite_token, auth_user_id,
-- pattern, vacations. The switcher needs a name, a colour, a cafe and whether
-- the row has a PIN set — nothing else. A DEFINER function bypasses every
-- column grant (trap 7), so the column list below is the only thing standing
-- between this and 015's whole reason for existing. Do not widen it.

BEGIN;

CREATE OR REPLACE FUNCTION public.dev_list_identities()
RETURNS TABLE (
  id        uuid,
  cafe_id   uuid,
  name      text,
  color     text,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT w.id, w.cafe_id, w.name, w.color, w.joined_at
  FROM public.waiters w
  WHERE w.cafe_id = (SELECT c.id FROM public.cafes c ORDER BY c.created_at LIMIT 1)
  ORDER BY w.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.dev_list_identities() TO anon, authenticated;

COMMIT;


-- ── VERIFY ─────────────────────────────────────────────────────────────────
--
-- 1. It answers from outside, with no session:
--
--      curl -s -X POST 'https://simavghwjnqytcyeunto.supabase.co/rest/v1/rpc/dev_list_identities' \
--        -H 'apikey: sb_publishable_xOx4POsl9coB1utDMHlHAw_h1q4oxWA' \
--        -H 'Content-Type: application/json' -d '{}'
--      -- expect: 200 and the seeded dev roster, five keys per row and no more
--
-- 2. It does not exist on production. Run this against the PRODUCTION base URL
--    and key from osmica.html:1113-1114 — this is the check that this file
--    stayed where it belongs:
--
--      curl -s -o /dev/null -w '%{http_code}\n' \
--        -X POST "$PROD_BASE/rest/v1/rpc/dev_list_identities" \
--        -H "apikey: $PROD_KEY" -H 'Content-Type: application/json' -d '{}'
--      -- expect: 404. Anything else means it was pasted into the wrong editor
--      --         tab; drop it there immediately.

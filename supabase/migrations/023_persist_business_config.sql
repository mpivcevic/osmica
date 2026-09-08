-- 023 — Persist the business configuration on the café (roster module, ticket 09).
--
-- The roster module (tickets 03–08) already takes the opening policy, the
-- enabled shifts and the special weekday as *inputs*; until now buildRoster fed
-- it a frozen constant, so the owner-facing capability ADR-0001 describes —
-- closing or fully opening a day after generation and having every screen honour
-- it at once — was latent, unreachable through the UI. This gives those inputs a
-- persistent home so the owner's choices survive a reload and reach every screen.
--
-- One jsonb column, not a table and not discrete columns: the owner already
-- loads select('*'), RLS inherits, and roster.js consumes the policy object
-- as-is. Its shape is roster-canonical throughout — `opening-only` (not the
-- shiftmaker's 'morning'), Monday-start dow with Sunday = 6 (not getDay()'s 0):
--
--     {
--       "type": "coffee",
--       "specialWeekday": 6,
--       "policy": { "weekday": { "6": "opening-only" }, "overrides": {} },
--       "enabledShifts": ["jutro", "međusmjena", "popodne"]
--     }
--
--   • policy.weekday is a sparse map carrying only non-full weekdays; roster.js
--     passes it through and resolves omissions to full.
--   • specialWeekday records which day the picker owns even when that day is full
--     (the retail case, where a pure map would lose it).
--
-- MIGRATION / NO REGRESSION. Every existing café is a Croatian coffee shop with
-- a Sunday-opening-only special day. The column default is exactly that shape, so
-- the ADD COLUMN back-fills every current row to today's behaviour: coffee shop,
-- special weekday Sunday, opening-only default, no overrides, all three shifts
-- enabled. Nothing a current café sees changes on deploy.
--
-- RLS / GRANTS. No new policy or grant. `authenticated` keeps table-level SELECT
-- on cafes (only anon was revoked, 003/019); a new column is covered by
-- cafes_owner_all (owner) and cafes_waiter_read (waiter) already. The waiter path
-- widens its select('name') to also read business_config — a client change, not
-- a grant one.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS business_config jsonb NOT NULL DEFAULT
    '{"type":"coffee","specialWeekday":6,"policy":{"weekday":{"6":"opening-only"},"overrides":{}},"enabledShifts":["jutro","međusmjena","popodne"]}'::jsonb;

COMMIT;

-- Verify: every café now carries the coffee-shop default, and no row is null.
--   select count(*) filter (where business_config is null) as nulls,
--          count(*) as total
--   from public.cafes;
--   -- expect: nulls = 0, total = however many cafés exist

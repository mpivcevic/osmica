-- 023 (dev) — Persist business_config on cafes. RUN THIS AGAINST DEV ONLY.
--
-- The dev twin of prod 023. The column, its default and its back-fill are
-- identical — the ADD COLUMN is generic (no policy, no grant), so this file is a
-- verbatim copy of the prod statement kept under the dev tree only so a dev
-- database created from dev/010 gets the column too (010's CREATE TABLE
-- IF NOT EXISTS never adds a column to an existing table on re-run).
--
-- The dev project keeps its permissive dev_open_* policies (dev/010); they are
-- FOR ALL and already cover the new column. Nothing else to open.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS business_config jsonb NOT NULL DEFAULT
    '{"type":"coffee","specialWeekday":6,"policy":{"weekday":{"6":"opening-only"},"overrides":{}},"enabledShifts":["jutro","međusmjena","popodne"]}'::jsonb;

COMMIT;

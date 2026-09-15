# Backup & restore runbook (production)

The **why** is in [ADR-0003](adr/0003-backup-restore-strategy.md). This is the
**how** — the thing you open when a migration goes wrong.

**One-line model:** before every migration, dump the four production tables to a
single `.sql` file in your OneDrive folder. If a migration wrecks the data, run
that file back. Nothing here protects a lost phone — that needs no backup; the
data is in the cloud, you just sign in again. This protects only against the
**cloud data itself** being damaged or destroyed.

**Scope:** `cafes`, `waiters`, `shift_requests`, `date_schedules` — data only.
Login identities (`auth.users`) are deliberately **not** backed up; after a
restore the owner re-signs-in and each waiter re-opens their invite link once.

> ⚠️ **The dump file contains staff names and phone numbers (PII).** Keep it only
> in your own OneDrive, never commit it, never paste it anywhere shared. See
> *Retention & GDPR* at the bottom.

This procedure was set up and verified end-to-end on **2026-09-15** (WSL /
Ubuntu): a production dump, and a full wipe-and-restore rehearsal on dev that
returned identical row counts.

---

## The tools (why pg_dump, not the Supabase CLI)

We use the native **`pg_dump` / `psql`** from `postgresql-client`. The Supabase
CLI's `supabase db dump` was the first choice but it runs its dumper **inside
Docker**, which isn't installed here (`docker: command not found`). Native
`pg_dump` needs no Docker. The only catch native `pg_dump` has — its version must
be **≥** the server's — is satisfied automatically: Ubuntu ships `pg_dump 18`,
newer than Supabase's Postgres.

## Connections (use the Session pooler)

Both dumps and restores connect through the project's **Session pooler**
(dashboard → **Connect** → **Direct — Connection string** → **Session pooler**),
because it is **IPv4** (WSL has no reliable IPv6) and on **port 5432** (session
mode supports `pg_dump`; the Transaction pooler on 6543 does **not**). The string
looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

- production ref `vuvvzzktrxydfxgxugke`, region `eu-west-1`
- dev ref `simavghwjnqytcyeunto`, region `eu-west-2`

**The DB password can't be viewed after project creation — only reset** (same
Connect screen → *Reset database password*). Resetting is safe: nothing in Osmica
uses it (the app uses the publishable API key at `osmica.html:1113-1114`;
migrations go through the SQL editor's own login). Pick a letters+digits password
to avoid percent-encoding it in the URL. Keep the finished connection string in
your password manager — do **not** save it to a file in the repo.

---

## One-time setup (once, ~5 min)

1. Install the client tools (gives `pg_dump` **and** `psql`):
   ```bash
   sudo apt-get update && sudo apt-get install -y postgresql-client
   ```
2. The backup script already lives at
   `C:\Users\misla\OneDrive\osmica-backups\osmica-backup.sh`
   (in WSL: `/mnt/c/Users/misla/OneDrive/osmica-backups/osmica-backup.sh`). It
   dumps the four tables into its own folder, which OneDrive syncs. It reads the
   connection string from `OSMICA_PROD_DB_URL`, so no secret is stored in it.

---

## Backup — the pre-migration ritual

**Before you paste any migration into the production SQL editor**, in a WSL
terminal:

1. Set the production connection (paste your real password; keep single quotes):
   ```bash
   export OSMICA_PROD_DB_URL='postgresql://postgres.vuvvzzktrxydfxgxugke:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
   ```
2. Run the backup:
   ```bash
   bash /mnt/c/Users/misla/OneDrive/osmica-backups/osmica-backup.sh
   ```
   It prints `Done: …/osmica-prod-YYYY-MM-DD.sql (NN lines, 4 table blocks)`.
   Four table blocks = all four tables captured.
3. Wait for OneDrive to show the file as **synced** (green tick).
4. *Now* run your migration.

Run it manually any other time too — it's cheap and just writes a new dated file.

---

## Restore

Two cases. Work out which you're in before touching anything.

### Case A — a bad migration mangled the DATA, tables still exist

The common case. Structure intact; rows wrong, missing, or deleted. This is the
exact round-trip proven on dev on 2026-09-15.

1. Set the production connection (as in the backup ritual, step 1).
2. Pick the file — the newest `osmica-prod-*.sql` from *before* the bad migration
   (usually today's pre-migration dump).
3. **Empty the four tables** (one statement; `cafes` cascades to the other three,
   all their FKs are `ON DELETE CASCADE`):
   ```bash
   psql "$OSMICA_PROD_DB_URL" -c "TRUNCATE public.cafes CASCADE;"
   ```
4. **Load the dump back** (data restores in dependency order — `cafes` first):
   ```bash
   psql "$OSMICA_PROD_DB_URL" -f /mnt/c/Users/misla/OneDrive/osmica-backups/osmica-prod-YYYY-MM-DD.sql
   ```
   It prints a `COPY` line per table.
5. **Verify** — see below.

### Case B — the structure is broken, or the whole project is lost

Rare: a migration corrupted the schema itself, or the Supabase project is gone.

1. **Rebuild the structure from git**, in migration-number order, in the SQL
   editor: the files in `supabase/migrations/` (that folder's `README.md` is the
   authority for which have run). On a brand-new project this is every production
   migration from `001` onward.
2. **Load the newest good data dump** exactly as in Case A steps 1–4.
3. If it's a **new project** (new ref), point the app at it: the production
   Supabase URL + key are hard-coded at `osmica.html:1113-1114`, gated to
   `location.hostname === 'mpivcevic.github.io'`. Update them and redeploy.
4. **Verify** — see below.

---

## Verify (never skip — it's the half that gets skipped)

Three independent checks:

1. **Row counts** — confirm they match what you expect from the dump:
   ```bash
   psql "$OSMICA_PROD_DB_URL" -c "select 'cafes' t, count(*) from public.cafes union all select 'waiters', count(*) from public.waiters union all select 'shift_requests', count(*) from public.shift_requests union all select 'date_schedules', count(*) from public.date_schedules order by t;"
   ```
2. **The external probe** — the from-outside check in
   `supabase/migrations/README.md` → *"Verifying anything"* (publishable key, no
   session). Expected since Stage D: every table/column line `401`, `claim_invite`
   `200`. Proves the grants survived, not just the rows.
3. **Open the app** against production and confirm the roster, a waiter's pattern,
   and the request history render correctly.

---

## Rehearse on dev first

Never let a real restore be the first time you run these steps. On **osmica-dev**
(`simavghwjnqytcyeunto`, region `eu-west-2`), the exact rehearsal that was run and
passed on 2026-09-15 — dump, wipe, restore, and confirm the counts return
identical:

```bash
export OSMICA_DEV_DB_URL='postgresql://postgres.simavghwjnqytcyeunto:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres'
# BEFORE counts (note them):
psql "$OSMICA_DEV_DB_URL" -c "select 'cafes' t, count(*) from public.cafes union all select 'waiters', count(*) from public.waiters union all select 'shift_requests', count(*) from public.shift_requests union all select 'date_schedules', count(*) from public.date_schedules order by t;"
# dump dev:
pg_dump "$OSMICA_DEV_DB_URL" --data-only --no-owner --no-privileges -t public.cafes -t public.waiters -t public.shift_requests -t public.date_schedules -f /mnt/c/Users/misla/OneDrive/osmica-backups/osmica-dev-$(date +%F).sql
# wipe + confirm empty:
psql "$OSMICA_DEV_DB_URL" -c "TRUNCATE public.cafes CASCADE;"
psql "$OSMICA_DEV_DB_URL" -c "select count(*) from public.cafes;"   # expect 0
# restore + AFTER counts (must equal BEFORE):
psql "$OSMICA_DEV_DB_URL" -f /mnt/c/Users/misla/OneDrive/osmica-backups/osmica-dev-$(date +%F).sql
psql "$OSMICA_DEV_DB_URL" -c "select 'cafes' t, count(*) from public.cafes union all select 'waiters', count(*) from public.waiters union all select 'shift_requests', count(*) from public.shift_requests union all select 'date_schedules', count(*) from public.date_schedules order by t;"
```

Dev's data is disposable (rebuildable from `dev/010` + `dev/011`), so it's the
safe place to prove the drill and time it.

---

## Retention & GDPR

- **For now:** keep every dump. They're tens of KB and it's all test data — no
  real PII yet.
- **Trigger — the day the first real café goes live** (both fire together):
  1. **Add a weekly scheduled dump** so a non-migration disaster loses at most a
     week of real changes. In WSL, a cron entry running `osmica-backup.sh` with
     `OSMICA_PROD_DB_URL` available; or on Windows, a Task Scheduler job. (WSL
     cron only runs while WSL is running — verify it fires.)
  2. **Apply bounded retention (~90 days)** — the dumps then hold real
     EU-employee names and phone numbers, so old copies must not accumulate
     indefinitely. This is the concrete hook for the **Retention policy** work
     item in `WorkFile.md`; resolve the exact window and legal basis there.

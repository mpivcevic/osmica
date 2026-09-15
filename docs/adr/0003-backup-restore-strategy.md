# ADR-0003: Backup is a maintainer-run logical export to off-Supabase storage

**Status:** Accepted (2026-09-15)

## Context

There is one production database, and its schema changes by **hand**: a migration
is a `.sql` file pasted into the Supabase SQL editor and run (see
`supabase/migrations/README.md` — "Applied by hand … there is no migration
runner"). Nothing sits between a wrong paste and the data. One `DROP`, one
`DELETE` that reaches further than intended, one wrong file, and the roster and
the whole shift-request history are gone in a second. Until now there was no
backup story written down anywhere, and this is the window to fix that **before**
real staff data lands — today the production rows are the builder's own test data.

Two things sharpen the decision:

- **The threat is logical, not physical, and its timing is known.** The danger is
  a human editing the database on purpose, at a moment we choose (a migration),
  not a disk dying at random. That makes a snapshot *taken right before each
  migration* the natural control, and makes second-granularity point-in-time
  recovery far more machinery than the threat needs.
- **A backup here is a disaster net, nothing more.** Osmica's data lives in
  Supabase, never on the phone; the PWA is a window onto the cloud. Losing a
  phone, reinstalling, a forgotten login — none of these need a backup, because
  the cloud row is untouched and the user simply signs in again. A backup earns
  its keep in exactly one situation: **the cloud data itself is damaged or
  destroyed**, when there is no device to fall back on because the source of
  truth is what broke.

The data at stake is the four `public` tables, all cascading from `cafes`:
`cafes` (business + `business_config`), `waiters` (names, **phones**, patterns,
vacations), `shift_requests` (the full request/approval history) and
`date_schedules` (the generated schedule). `waiters` holds the PII — names and
phone numbers of EU employees — so any backup file is itself a store of personal
data, which is where this decision touches the neighbouring **retention / GDPR**
work item.

## Decision

A backup is a **maintainer-run logical export of the four production tables to a
file stored off Supabase.** Concretely:

- **Scope: the four data tables only.** `cafes`, `waiters`, `shift_requests`,
  `date_schedules` — the owner's complete business record. Everything a waiter
  "has" is already owner data in these tables; there is no separate waiter backup.
- **Identities are *not* backed up.** The Supabase login rows (`auth.users`, and
  the `waiters.auth_user_id` links) are left out. After a restore, the owner signs
  in again and each waiter re-opens their invite link once — minutes of re-invite,
  no data lost. This keeps the export reachable without touching the `auth` schema.
- **Production only.** Dev holds seeded fakes rebuildable from
  `dev/010_dev_schema.sql` + `dev/011_dev_seed.sql`, so it needs no backup of its
  own. Dev instead serves as the **restore-rehearsal target**, so the drill is
  never practised for the first time on live data.
- **Data-only dump; migrations stay the authority for structure.** The file
  carries rows, not schema. The migration files in git remain the single source of
  truth for the tables' shape. One authority for structure (git), one for data
  (the dump).
- **Single `.sql` file via native `pg_dump`/`psql`**, because the moment that
  matters is the *restore*, and a restore that is "run one file back" beats one
  that is "re-import four CSVs in foreign-key order while panicking." (Originally
  specified as `supabase db dump`, but that runs its dumper inside Docker, which
  isn't installed on the maintainer's WSL box; native `pg_dump` needs no Docker
  and its only constraint — version ≥ the server — is met by Ubuntu's `pg_dump 18`.
  Same single-data-only-`.sql` outcome either way.)
- **Stored in a synced cloud folder** (OneDrive on the Windows box; Google Drive
  equivalent). The desktop sync client uploads it, so the copy survives even
  Supabase losing the entire project — with zero integration code.
- **The maintainer operates it, not the café owner.** There is one shared
  production DB and the maintainer is the one applying migrations, so the
  safeguard is inherently central and technical. Café owners are protected without
  doing anything; there is no in-app export feature in this decision.
- **Cadence: before every migration.** A snapshot immediately precedes each
  hand-applied migration, plus manual runs at will. No background schedule yet —
  documented trigger to add a weekly one is the day the first real café goes live.
- **Retention: keep all for now.** Dumps are kilobytes and it is all test data.
  Documented trigger: apply a bounded retention (~90 days) once real staff data
  lands, and let the **retention / GDPR** work item own the deep call.

The operational step-by-step — setup, the pre-migration ritual, both restore
paths, and verification — lives in the runbook at `docs/backup-restore.md`. This
ADR records *why*; the runbook records *how*.

### Rejected alternatives

- **Supabase Pro scheduled backups (~$25/mo)** — costs money now for tiny
  pre-production data, keeps nothing older than 7 days, is only day-granular for
  the bad-migration case, and the copy lives *inside* Supabase, so it does not
  survive the project or account being lost.
- **Supabase PITR add-on** — sharpest tool for "undo the migration at 14:32," but
  the most expensive, and still Supabase-hosted, so no protection against losing
  the project itself. Far more than a logical, known-timing threat needs.
- **CSV/JSON export from the SQL editor** — zero install, easiest to *create*, but
  restore means re-importing four files in FK order and resolving conflicts by
  hand, exactly when it needs to just work.
- **Full schema+data dump** — self-contained for total loss, but the dumped
  structure can drift from the migration files (two competing authorities for
  schema) and it conflicts when restored over a live DB.
- **In-app owner self-serve export** — a product feature (peace of mind, GDPR
  portability), not disaster recovery: it cannot save anyone from a bad migration
  wiping the shared DB. Kept out of scope, and *not* logged as a separate item.
- **Backing up identities (`auth.users`)** — would spare the re-invite, but forces
  a real `auth`-schema dump and restore; not worth it while linked accounts are few.
- **Backing up dev** — its data is disposable and reproducible from schema + seed.

## Consequence

There is now a written, off-Supabase safety net for the one loss the security
stages could never touch: the data itself. A wrong migration paste is recoverable
because a copy from seconds earlier sits in OneDrive; total project loss is
recoverable because that copy is not in Supabase at all.

The cost is that the net is only as fresh as the last pre-migration snapshot: a
non-migration disaster between migrations (a bad one-off query, Supabase losing
the project) loses changes made since. This is acceptable while data is test/seed
and is retired by the documented weekly-schedule trigger at first real café.

Two obligations are carried forward as explicit triggers rather than silent
assumptions: (1) add a weekly scheduled dump when the first real café goes live;
(2) apply bounded (~90-day) retention on the dump files at the same moment, since
they then hold real EU-employee PII — the concrete hook by which the
**retention / GDPR** work item becomes actionable. Neither is a change of this
decision; both are dates on which this decision grows a second half.

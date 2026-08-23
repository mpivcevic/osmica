# Migrations

Applied by hand in the Supabase SQL Editor. There is no migration runner, so
these numbers are documentation rather than instructions — Postgres never sees
them. They exist so a file can be named unambiguously in conversation and in a
commit message.

## Numbering rule

**One shared counter across both databases. Never reuse a number.**

The next migration takes the next free number regardless of which project it
targets. As of 23 Aug 2026 the high-water mark is `018`, so the next file —
production or dev — is `019`.

Production's sequence will therefore have gaps. That is expected: a gap means
that number went to dev.

- Production migrations live in `migrations/`
- Dev migrations live in `migrations/dev/` **and carry `dev` in the filename**

Both, so that neither the folder nor the name alone has to carry the meaning.

### The two historical collisions

Before this rule, each project numbered independently, and two numbers mean
different things depending on the folder:

| number | `migrations/` | `migrations/dev/` |
|---|---|---|
| `010` | rotate leaked credentials | dev schema |
| `011` | revoke residual privileges | dev seed |

Left as they are, deliberately — renaming applied migrations breaks the link to
the commits and notes that reference them. When referring to either number, say
which folder.

## What is applied where

Verified by probing with the publishable key and no session, not by trusting the
SQL editor's success message.

### `migrations/` — `osmica-production` (`vuvvzzktrxydfxgxugke`)

| | file | state |
|---|---|---|
| 001 | claim_invite RPC | ✅ applied |
| 002 | revoke anon columns | ⚠️ ran clean, **did nothing** — superseded by 005 |
| 003 | revoke anon writes | ✅ applied |
| 004 | rate limit PIN login | ❌ **never run — superseded by 009** |
| 005 | fix anon column grants | ✅ applied |
| 006 | revoke anon phone | ✅ applied |
| 007 | token-keyed set_waiter_pin | ✅ applied |
| 008 | drop insecure set_waiter_pin | ✅ applied |
| 009 | rate limit both PIN oracles | ✅ applied |
| 010 | rotate leaked credentials | ✅ applied |
| 011 | revoke residual privileges | ✅ applied 17 Aug — mark_invite_joined confirmed gone on both |
| 014 | Stage C1: waiter identity (`auth_user_id`, `link_waiter_to_auth`) | ✅ applied 18 Aug — **both projects**; six production rows verified `auth_user_id` null |
| 015 | scope the `authenticated` role: RLS + column grants | ✅ applied 19 Aug — **both projects**, alongside the v4.38 deploy |
| 017 | Stage C3a+C3b: `owner_unlink_waiter`, `linked` in `owner_list_waiters` | ✅ applied — **both projects**, dev 22 Aug and production 23 Aug. Signature confirmed to end in `linked boolean` on both, and `owner_unlink_waiter` probed `401` `42501` from outside |
| 018 | Stage C4: drop the PIN login surface | ⏳ **written, not applied.** Gated — see `TaskList_2026-08-23.md`. Requires **v4.42 deployed first** on the project being migrated, unlike `017`: a v4.41 client calls `set_waiter_pin_by_token` and `verify_waiter_pin` and stops working the moment they go |

### `migrations/dev/` — osmica-dev (`simavghwjnqytcyeunto`)

| | file | state |
|---|---|---|
| 010 | dev schema | ✅ applied |
| 011 | dev seed | ✅ applied |
| 012 | token-keyed set_waiter_pin (dev variant) | ✅ applied |
| 013 | align dev with production | ✅ applied — reads and constraints only; **declined `003` on purpose**, see its line 15 |
| 016 | align dev's writes with production | ✅ applied 22 Aug — drops `dev_open_*`, replays `003`'s revokes |

Production's `009`, `011`, `014` and `015` are also run against dev — they are
not dev-specific, so they get no dev-numbered file. **`003` was never run on
dev**; `dev/016` replays it instead, and is the file to read for why the
divergence was deliberate and why it stopped being defensible.

High-water mark is now `018` — like `017` it targets both projects and
therefore gets no `dev/` twin. The next file, either project, is `019`.

## Two files that are kept on purpose despite never being run

**`002`** reports success and achieves nothing. A column-level
`REVOKE SELECT (col) ... FROM anon` cannot subtract from a table-level grant,
which the role already held. The working shape is `REVOKE SELECT ON t FROM anon,
PUBLIC` followed by `GRANT SELECT (safe, cols) ON t TO anon`, which is what 005
and 006 do.

**`004`** would have made things worse in a way that reads as correct: it
throttles only one of the two PIN entry points, never decays its counter (so a
café accumulating one fumbled PIN a week eventually locks itself out forever),
and leaves its helper functions `EXECUTE`-able by `PUBLIC` — meaning
`register_pin_failure` becomes a café-lockout button for anyone. `009` supersedes
it and fixes all three.

Both are more useful as worked examples than they would be deleted.

## Traps this project has already hit

1. **A column-level `REVOKE` is silently a no-op** against a table-level grant,
   and reports success. See `002` above.
2. **pgcrypto lives in the `extensions` schema.** A `SECURITY DEFINER` function
   pinned to `SET search_path = public, pg_temp` loses `crypt()` and
   `gen_salt()` — and loses them **on the happy path only**, so token- and
   format-validation smoke tests still pass while the function is broken. Use
   `public, extensions, pg_temp`. Plain trigger functions do not need the pin at
   all: they run as the invoker, not the owner.
3. **Re-running a corrected migration through a *saved query*** in the SQL editor
   re-applies the old text. Confirm what actually landed:
   `select proname, proconfig from pg_proc where proname = '…';`
4. **Audit `SECURITY DEFINER` bodies separately from table grants.** A DEFINER
   function bypasses every column grant, so the question is what it
   *authenticates*, not what it returns. Reading the bodies found an
   unauthenticated account takeover that months of endpoint probing had not.
5. **Default grants are invisible.** `TRUNCATE`, `TRIGGER` and `REFERENCES`
   arrive from Supabase's `GRANT ALL` on new tables, never appear in application
   code, and survived `003`. `TRUNCATE` also **ignores RLS**, so it must be gone
   before Stage D or the policies are bypassable. See `011`.

6. **A role is not an identity.** Every migration up to `011` narrowed `anon`
   and left `authenticated` untouched, which was correct only while the owner's
   password was the sole way to obtain that role. Enabling anonymous sign-ins
   made it self-service, and every grant written for "the owner" silently became
   a grant to anybody. Before enabling any new auth method, re-read what the
   roles it hands out already carry. See `015`.
7. **RLS cannot hide a column.** Policies filter rows; a session that can read
   a row reads every column it holds a grant for. Sensitive columns need the
   grant removed and a `SECURITY DEFINER` accessor, not a policy.
8. **A `204` from `PATCH` or `DELETE` under RLS means "no rows matched", not
   "it worked".** The two are indistinguishable from the status code alone. On
   22 Aug an anonymous session sent `PATCH /cafes?id=eq.<the real café>` with
   `{"name":"pwned"}` and got `204` — which reads as a successful takeover and
   was in fact `cafes_owner_all` filtering the row away. Always add
   `Prefer: return=representation`: `[]` is proof that nothing was touched, and
   a returned row is proof that something was. `003`'s header hit the same trap
   from the other side, where the filter matched no rows *and* the write was
   permitted.
9. **A permissive policy cannot be narrowed by adding another policy.**
   Permissive policies combine with **OR**, so one blanket
   `FOR ALL USING (true)` makes every other policy on that table irrelevant. Dev
   carried `dev_open_*` from `dev/010` alongside `015`'s ten scoped policies for
   three days; `015` was inert there the whole time and its browser tests passed
   for the wrong reason. Before trusting any policy, list what else is on the
   table: `select tablename, policyname, roles, cmd from pg_policies where
   schemaname = 'public';` See `dev/016`.
10. **A migration's name is not its coverage.** `dev/013` is called "align dev
   with production" and aligns reads, constraints and triggers — not writes,
   which it declines on purpose in a comment at line 15. Read what a migration
   does, not what it is called.
11. **The admin panel's "activated" is `joined_at`, not `auth_user_id`.** A
   waiter who set a PIN shows as activated forever; whether they can *write*
   depends on `auth_user_id`, which the panel never displays. On 22 Aug five dev
   waiters read as activated and none of them could raise a swap request. Any
   question about who can write is answered by SQL, never by the UI:
   `select name, joined_at is not null as activated, auth_user_id is not null as
   linked from public.waiters order by name;`
12. **When a refusal is the expected result, one generic error toast is not
   evidence.** The client shows the same *"Greška. Pokušajte ponovo."* for a
   correctly-enforced policy and for a broken app. Distinguish them by the
   status: 403 `new row violates row-level security policy` is the policy
   working, 401 `42501` means the caller was `anon` and never reached it.
13. **`CREATE OR REPLACE` cannot change a `RETURNS TABLE` signature.** Adding a
   column to a set-returning function fails with "cannot change return type of
   existing function" — it needs `DROP FUNCTION` then `CREATE`, and the grants
   re-issued afterwards, because dropping takes them with it. Do both inside one
   transaction so no caller ever sees the function missing. See `017`.
14. **`already_linked` and "this waiter is already linked" are different
   things.** `link_waiter_to_auth` returns `already_linked` only when the
   *caller's* uid is bound (`014:57-63`). A waiter whose row is bound, arriving
   from a new browser, returns `invalid_token` instead — and the client counts
   only `ok`/`already_linked` as success, so recovery fails with nothing but a
   console warning. Clearing `auth_user_id` is what makes a row claimable again.
15. **Postgres does not check function bodies when you drop a column.**
   `ALTER TABLE … DROP COLUMN pin_hash` succeeds with every `SECURITY DEFINER`
   function that reads or writes that column still in place, still listed in
   `pg_proc`, still passing any query you can write in the SQL editor — and
   throwing `column "pin_hash" does not exist` the first time a person actually
   calls one. `018` rewrites `owner_unlink_waiter` before dropping the column
   for exactly this reason, and its step 5 is a button press rather than a
   query, because a query cannot catch it.
16. **"Permission denied" is not "does not exist".** When the goal is deleting
   a function rather than fencing it, `401` with `42501` is a **failure** that
   reads like the pass you have been trained by every earlier probe to expect.
   `404` with `PGRST202` — PostgREST refusing to admit the function is in the
   schema cache — is the only answer that proves a `DROP` landed.

## Verifying anything

Never trust a green "Success". Re-probe from outside, with the publishable key
and no session — the SQL editor answers as a superuser and so cannot tell you
what a stranger can reach.

```bash
# dev. For production swap in the two values from osmica.html:1113-1114.
BASE='https://simavghwjnqytcyeunto.supabase.co'
KEY='sb_publishable_xOx4POsl9coB1utDMHlHAw_h1q4oxWA'
for q in 'name,color' 'phone' 'invite_token' '*'; do
  printf '%-14s ' "$q"
  curl -s -o /dev/null -w '%{http_code}\n' "$BASE/rest/v1/waiters?select=$q" -H "apikey: $KEY"
done
```

Expected, and **identical on both projects**:

```
name,color     200
phone          401
invite_token   401
*              401
```

`200` on any of the last three means a column grant did not take. `401` on the
first means the safe columns were revoked too far and the login screen is
broken.

To probe an RPC rather than a table, POST to `/rest/v1/rpc/<name>` with a body
of arguments — `TaskList_2026-08-22.md` step 2 has a worked example, including
the failure that looks like a pass: an error raised *inside* a function proves
the caller reached it, which is the opposite of what these probes want to see.

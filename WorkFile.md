# WorkFile — Osmica backlog

Working backlog, grouped by kind. Within each group, items run roughly
most-worth-doing first. Items marked _(added — vet)_ are suggestions, not yours.

## Functionality

- **Simplify new-member shift pattern** — when adding a team member, offer only
  first shift / second shift / middle shift / "no conditions" instead of the
  current fuller picker.
- **Add "Zahtjev za GO"** — a day-off request action.
- **Waiter-disconnect detection** — when a waiter loses the app (cleared cache,
  new phone, etc.), reflect the changed status in the owner Admin panel. Find a
  clear way to present it; a notification when it happens may be worth it.
- **Employee types (Student / Regular)** — set on create in the Admin panel,
  changeable later as someone moves Student → Regular. Mainly for big retailers
  (Tommy, Interspar).
- **Phonebook access for invites** — invite members from the phone's contacts,
  ideally adding several at once.
- **Per-person phone numbers before first 💬** — every production row carries the
  builder's own number today, so every invite message would be addressed to him.
  Must land before anyone presses the WhatsApp action. _(moved from Stage E carve-out)_
- **Remember owner e-mail** — a remember-me option for owners, ideally tied to the
  phone.
- **Accounting export** — monthly timesheets as an export file, adapted to Croatian
  accounting standards.
- **Login errors** — surface them (inline note + screen shake?).
- **Rename request tabs?** — Otvorene / Moje / Pokrivene: should "Pokrivene" become
  odobrene/odbijene (approved/rejected)? NB: `CONTEXT.md` defines **Coverage
  (Pokrivene)** as "who actually works a shift," not a request status — that is
  **Standing** (`approved` / etc.). Resolve the naming in `CONTEXT.md` first.
- **Part-time / cross-shop shift "licitation"** (exploratory) — let someone who
  works for another shop cover a free shift; a marketplace/auction for work hours.

## Visual / UX

- **Invite/login screen scaling** — not scaling properly. Reduce the numpad by
  ~15%, enlarge "Štacija" (the business name) to match the "Postavi 4-znamenkasti
  PIN…" line; the whole screen must fit on one screen in all browsers.
    - The **installed** rendering is the reference for "correct" — it looks perfect
      after install. Take screenshots during implementation (none exist yet); the
      agent can also open the app headless and check rendering at the target
      viewports. Open triage question: which browsers/phones are the target?
      (iOS Safari's collapsing toolbar is what usually breaks "fits one screen".)
- **First-run visual tour** — evaluate feasibility and whether it makes sense.
- **Admin-panel mouseover info** — tooltips for link / edit / delete. Questionable,
  since this is primarily a mobile app.

## Reliability & offline

These are product bugs, not security items (reclassified 24 Aug 2026 out of the
security stages).

- **`getSession()` timeout guard** — SHIPPED 13 Sep 2026 (Build 4.48, commit
  `a83d1ae`). `init()` no longer waits forever on `getSession()` when auth stalls
  (23 Aug outage: GoTrue 45–82s vs 0.5s healthy): a 5s `Promise.race` on init's
  call only degrades to one retry screen with a 3-state adaptive message (offline
  / server-timeout / error) + Retry button. The v4.42 local-unlock `if (!ok)`
  branch is removed — waiter and owner both land on the same screen. New pure
  helpers live in `authstatus.js` (+ `authstatus.test.js`, node --test).
    - Decision record: `docs/adr/0002-fail-auth-to-retry-screen.md`. Task list:
      `.scratch/reliability-auth-timeout/tasklist.md`.
    - ⚠️ **Not yet verified in a running browser** — Slice 3 (live DevTools
      checks) was NOT done. Still to confirm on localhost (DEV pill): offline
      state (Network → Offline, reload) shows offline text + Retry; timeout state
      (block the GoTrue URL or throttle >5s) shows the server-not-responding text
      after ~5s + Retry; Retry reloads and recovers once the block is removed;
      happy path still routes owner/waiter well under 5s.
    - Follow-up ticket (not done): guard the invite-claim `getSession()`
      (`osmica.html:1800`) with its own invite-screen timeout message.
- **Offline shell** — DEFERRED 13 Sep 2026. Once local unlock was killed, a
  standalone offline shell only swaps the browser error page for a branded "you're
  offline" screen — polish, not function — and adds risk to the "fresh version on
  every open" guarantee (`sw.js` is deliberately network-only for HTML/JS). Real
  value needs cached roster data too. Revisit as **shell + cached reads** only if
  "see my schedule with no signal" becomes a genuine need.

## Security

_Tracked privately — see `.scratch/security/` (gitignored), kept out of this public repo._

## Data & privacy

- **Written backup/restore procedure** — there is no backup story written down
  anywhere; losing the schedule and request history to a bad migration would hurt
  Štacija more than anything the security stages closed.
- **Retention policy** — what happens to an employee's rows when they leave. Once
  real staff use this it stores names, phone numbers and working patterns of EU
  employees. Decide before the first real roster, not after.

## Codebase & docs

- **Headless screenshot harness for visual QA** — a repeatable way to capture the
  target viewports for the invite/login scaling work and future visual fixes.
- **Continue extracting logic from `osmica.html` behind tests** — the `roster.js` /
  `dates.js` split is the pattern; keep peeling testable logic out of the single
  file.

## Reference & notes

- **cloudflared tunnel:**
  `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5500`

- **Waiter status check (activated / linked):**
  ```sql
  select name,
         joined_at    is not null as activated,
         auth_user_id is not null as linked
  from public.waiters order by name;
  ```
  
- **Competitor scan** — check 7shifts, Homebase and Deputy for ideas.

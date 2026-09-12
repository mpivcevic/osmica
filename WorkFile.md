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

- **`getSession()` timeout guard** — when Supabase Auth is slow or down, `init()`
  waits forever and the app sits on the spinner with no message and no way out.
  Wrap it in a `Promise.race` timeout so an auth stall degrades to the login screen
  with a "check your connection" message.
    - `osmica.html:1509` (also `:1768`, `:4017`). Confirmed by the 23 Aug 2026
      outage: prod GoTrue answered in 45–82s vs 0.5s on dev while the DB was
      healthy. v4.42's offline fallback (the `if (!ok)` branch) is unreachable code
      until this exists, because the call above it never settles.
- **Offline shell** — the app cannot be cold-opened with no network. `sw.js` serves
  HTML network-only (`e.respondWith(fetch(e.request))`, no `.catch()`), so in
  airplane mode the reload gets the browser error page and `init()` never runs. Add
  a cached HTML fallback in the service worker.
    - Undercuts v4.42's own reasoning (a local PIN that dies with the wifi defeats
      the point). Weigh against why it's network-only today: guaranteeing a fresh
      version on every open.

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

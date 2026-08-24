**Edits:**
- Mouseover info for link, edit and delete in Admin Panel! Questionable since it's a mobile APP primarily?
- Shift pattern when adding a new team member needs to be simplified - for example only first shift, only second shift, only middle shift or "no conditions"
- Invite login screen needs modifications, it's not scaling properly (SS attached). In the example given, we need to reduce the size of numpad (approximately 15%), increase the size of Štacija (to match "Postavi 4-znamenkasti PIN..:") (what ever is the name of the business) - all this needs to fit one screen on all browsers. After the installation is done, screen format is perfect (SS attached). Do you need additional infor in regards to the prompt/task?
- Add "Zahtjev za GO"
- Create accounting export file, monthly timesheets - these need to be adopted to Croatian accounting standards.
- Login errors - note and screen shake?
- Remember e-mail option for owners, ideally connected to the phone.
- Add phonebook access for inviting members, ideally adding multiple of them at the same time
- Add types of employees, for example we start with Student and Regular. This should be the option inside Admin panel, when creating the new employee and something we can change as the time goes on, for those who move from Student to Regular for example. This will mostly be for big retailers like Tommy, Interspar and similar.
- Think about visual tour at first application start-up, how well can it be done and does it make sense?
- When the waiter loses connection to the APP for whatever reason (clearing cache, replacing a phone or something third) change the status in owners ADMIN panel. Think of claver ways to present it, we might need to send a notification when it happens?

> **Reclassified 24 Aug 2026, when Stage E was paused.** These were found while
> testing Stage C and carried through Stage D untouched. Two of the three are
> **not security work and should be fixed in the functionality push**: the
> `getSession()` timeout and the offline shell are both user-facing failures a
> barista will meet before any attacker does. The third — session / lock policy —
> stays with Stage E, because deciding how long an owner session lives is a
> security decision. See the Stage E block at the bottom of this file.

- Session / lock policy — the reload and re-entry flow needs designing properly. Today the only thing resembling a timer is a staleness reload (osmica.html:3909): tab hidden >= 15 min, then made visible again -> `location.reload()`. It was never meant as security, but it lands very differently per role. A waiter hits the keypad on every `init()`, so ANY reload is a PIN prompt -> they have a de-facto 15-minute auto-lock. The owner is dropped straight back in with nothing asked -> no session expiry at all (Supabase rotates the refresh token in localStorage indefinitely; only an explicit logout ends it). Decide deliberately: how long should an owner session live, should a waiter's PIN be asked on every open or only after N minutes idle, and should "unsaved text in a visible input" (the current reload guard) also block a lock. Safe but not annoying — the failure mode to avoid is a barista typing their PIN four times before service at 6am.
- `getSession()` has no timeout guard (osmica.html:1509, also :1768 and :4017). When Supabase Auth is slow or down, `init()` waits forever and the app sits on the loading spinner with no message and no way out. Confirmed by the 23 Aug 2026 outage: prod GoTrue was answering in 45–82s against 0.5s on dev, and the app was unusable while the database was perfectly healthy. Wrap it in a `Promise.race` timeout so an auth stall degrades to the login screen with a "check your connection" message. Note that v4.42's offline fallback (the `if (!ok)` branch that unlocks from a cached identity) is unreachable code until this exists, because the call above it never settles.
- No offline shell — the app cannot be cold-opened without a network at all. `sw.js` serves HTML network-only (`e.respondWith(fetch(e.request))`, no `.catch()`), so in airplane mode the reload gets the browser's error page and `init()` never runs. This undercuts v4.42's own reasoning: its offline branch exists because "a local PIN that stops working the moment the wifi does would defeat the point of moving it onto the device" — but that branch is only reachable when the site loads and Supabase does not (the 23 Aug outage), never on a genuinely offline open. For a PWA with a manifest and an install prompt, a barista in a basement with no signal gets nothing. Fix is a cached HTML fallback in the service worker, which has to be weighed against the reason it is network-only today: guaranteeing a fresh version on every open.


Orvorene/Moje/Pokrivene - Pokrivene bi trebalo imenovati kao odobrene/odbijene???
Check 7shifts, Homebase and Deputy for ideas!

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5500

Waiter status check (activated/linked)
select name,
       joined_at    is not null as activated,
       auth_user_id is not null as linked
from public.waiters order by name;


---

## Stage E — PAUSED 24 Aug 2026

Stages A–D are complete on both projects and **nothing in Stage E is an active
exposure** — that is what made pausing it reasonable. The app has no real users,
no real data, and the owner password currently guards seven test rows. What
blocks Štacija from actually using this is everything else in this file.

Stage E resumes after the functionality and design work. It is four separable
projects, not one stage: TOTP + new-device email for the owner; single-use
expiring invite tokens; dropping `phone`; and the session / lock policy above.
Design is in `osmica_security_plan.md` § Stage E; the state everything reached is
in `TaskList_2026-08-24.md`.

Two of them are **cheaper after** the product settles, which is a reason to wait
rather than an excuse: dropping `phone` depends on what the WhatsApp flow
becomes, and single-use invite tokens depend on the invite UX — phonebook access
and bulk invites are both on the list above. Building them now means building
them twice.

### The three carve-outs — things the pause must NOT defer

1. **The `getSession()` timeout and the offline shell move into the
   functionality push.** They are product bugs, not security items. An auth
   stall today is an infinite spinner with no message and no way out — that is
   exactly what the 23–24 Aug Supabase slowness looked like — and a PWA with an
   install prompt that cannot be cold-opened without signal fails the person it
   was installed for. Both are described in full above.

2. **Two things are triggered by real staff arriving, not by a stage.**
   - **Per-person phone numbers, before anyone presses 💬.** Every production row
     carries the builder's own number today, so every invite message would be
     addressed to him.
   - **Retention: what happens to an employee's rows when they leave.** Once real
     staff use this, it stores names, phone numbers and working patterns of
     employees in the EU. That is a decision to take before the first real
     roster, not after.

3. **Re-probe after the functionality work lands.** New features re-open old
   holes; `015` sat inert on dev for three days while its browser tests passed
   for the wrong reason (README trap 9). Run the loop in
   `supabase/migrations/README.md` § "Verifying anything" against **both**
   projects. Expected everywhere: `401` on every table and column, `200` on
   `claim_invite` as the control. It takes a minute.

### One thing that was never in any stage, and is a bigger practical risk

**There is no backup story written down anywhere.** Losing the schedule and
request history to a bad migration would hurt Štacija more than anything Stages
A–D closed. Not security work, not Stage E — but it belongs on a list, and this
is the list.

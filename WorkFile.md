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






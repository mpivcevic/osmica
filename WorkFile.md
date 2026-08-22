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
- Admin panel stays visible under the waiter screen when the owner logs out and a waiter logs in without a page refresh — two headers, two scrollbars. Cause: switchTab (osmica.html:2219) hides only the panes in getVisibleTabOrder(), and `admin` drops out of that list the moment tab-btn-admin is hidden, so the pane keeps display:flex from the owner session. Same applies to `month`. Fix: iterate all five panes instead of the visible order. Pre-existing, unrelated to Stage C, only reachable by someone who holds both roles.





Orvorene/Moje/Pokrivene - Pokrivene bi trebalo imenovati kao odobrene/odbijene???
Check 7shifts, Homebase and Deputy for ideas!

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5500

Waiter status check (activated/linked)
select name,
       joined_at    is not null as activated,
       auth_user_id is not null as linked
from public.waiters order by name;






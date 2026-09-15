# Next-session handoff — add team member from phone contacts

Temporary handoff note (committed so it survives a PC reset). **Safe to delete
once the work starts.** Paste the block below into a fresh session.

Context: last session shipped the backup/restore procedure (see
[ADR-0003](adr/0003-backup-restore-strategy.md) + [runbook](backup-restore.md)),
then scoped this as the next item. Feasibility was already worked out — the
prompt says what not to re-litigate.

```
Goal: simplify adding a team member — let the owner pick a contact from their
phone's address book, which pre-fills the new member's name + number; they add a
few more details and save. This is the "Phonebook access for invites" /
"Simplify adding members" idea in WorkFile.md (Functionality).

Feasibility already settled last session — do NOT re-litigate:
- Use the Web Contact Picker API:
    navigator.contacts.select(['name','tel'], {multiple:true})
  Works on Android Chrome / installed PWA; can pick several at once.
- iOS does NOT support it (WebKit never implemented it); a pure PWA cannot read
  the iPhone address book. iOS is intentionally left AS-IS (manual entry). We are
  NOT going native — Osmica stays a single-file PWA.
- Gate by FEATURE DETECTION, not device/UA sniffing:
    const canPickContacts = ('contacts' in navigator) && ('ContactsManager' in window);
  Show the "add from contacts" button only when true. HTTPS (GitHub Pages) and
  the user-gesture requirement (button tap) are already satisfied.
- Progressive enhancement: the picker is an OPTIONAL shortcut that pre-fills the
  EXISTING manual add-member form — never replaces it. So iOS, and any Android
  without the API, keep the current manual path untouched. Done this way it
  cannot break iOS.

Where it lands (osmica.html, ~246 KB — read targeted sections, not the whole file):
- The add/edit-member form already exists: inputs around lines 1019-1048 (name,
  `waiter-phone`, etc.); the save logic (~3567-3595) inserts the waiter row with
  {name, phone, color, pattern, vacations}. The picker just fills the name + phone
  inputs before the owner completes and saves — no schema change (waiters.phone
  already exists).
- Single-file PWA, no build/framework/libraries — keep everything inline.

On release: bump the in-app version label + add an osmica_changelog.html entry
(edit the ENTRIES array only). Likely NO sw.js CACHE bump — HTML/JS are served
network-only — but verify in sw.js.

Likely path: investigate the current add-member form + save flow, then implement
the feature-detected Android picker button that pre-fills the form.
```

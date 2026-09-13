# ADR-0002: A failed session is one retry screen, not an offline unlock

**Status:** Accepted (2026-09-13)

## Context

When the app opens, `init()` establishes who you are by reading the Supabase
session (`sb.auth.getSession()`). Two things can go wrong on that path, and they
were handled inconsistently:

1. **The call never returns.** `getSession()` awaits Supabase's internal auth init,
   which makes a network round-trip. There was no timeout, so when the auth server
   was slow-but-alive — the 23 Aug 2026 outage, GoTrue answering in 45–82s against
   0.5s healthy — `init()` never settled and the barista sat on the bare loading
   spinner with no message and no way out.

2. **The call returns but the follow-up lookup fails.** v4.42 added an offline
   branch: if the waiter lookup could not be reached, the app fell back to the last
   cached waiter identity and let them unlock locally with their PIN. The stated
   reasoning was that "a local PIN that stops working the moment the wifi does would
   defeat the point of moving it onto the device."

The problem with (2) is what actually lies behind that local unlock. The app has
no offline shell, no cached roster data, and no write queue: `loadAppData` swallows
its failure and leaves state empty, and every write (`submitRequest`,
`cover_request`, …) is a direct network call with no queue. So a waiter who unlocks
locally with no network lands in a **blank app where every action fails and is
lost** — a request typed in returns an error toast and is discarded. Local unlock
delivers something useful *only* when the network is actually up (e.g. auth stalled
but data endpoints fine), and in that case a plain retry reaches the same place
without dropping the user into a half-working shell first.

The owner has no local unlock at all — owner identity is server-only — so the
offline-unlock behaviour was waiter-only and, in practice, confusing rather than
helpful.

## Decision

Any failure to establish a real session resolves to **one screen**: a clear
message plus a **Retry** button (`location.reload()`). No one — waiter or owner —
is ever dropped into a locally-unlocked app.

- `init()`'s `getSession()` is wrapped in a **5-second timeout** (`Promise.race`).
  On timeout the app shows the retry screen instead of hanging.
- The v4.42 offline local-unlock branch (the `if (!ok)` cached-waiter path) is
  **removed**; the timeout path and the lookup-failure path both land on the retry
  screen.
- The message adapts to the detected cause, so the user knows whether to fix their
  connection or wait:
  - `navigator.onLine === false` → "you're offline, check your connection";
  - online + timeout → "the server isn't responding, usually temporary, wait and
    retry";
  - online + error → generic "something went wrong, retry".
- Distinct product states that are **not** connectivity failures — a device no
  longer linked to an account, a device never invited — keep their own dedicated
  messages.

This is a deliberate reversal of v4.42's "the local PIN must work offline" intent.

## Consequence

The infinite-spinner failure is gone: a stalled auth server degrades to an
actionable screen in 5 seconds. The behaviour is now uniform across roles and
causes — there is one place a failed sign-in goes, and it tells the user what to do.

The cost is that genuine offline access is given up **for now**. That access was
illusory anyway (an empty shell), so nothing usable is lost today. Reinstating it
is a deliberate future project, not an accident of error handling, and has a clear
prerequisite order: an **offline shell** (service worker serves the app with no
network) and **cached roster data** first — which restore real read value ("see my
schedule with no signal") — and only then, if justified, a **write queue** (whose
payoff is limited while owner notifications remain online-only). Local unlock is the
front door to that mode and would return with it; until then, failing to a single
retry screen is the honest behaviour.

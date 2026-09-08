# ADR-0001: Opening policy is the first gate on whether a waiter works a shift

**Status:** Accepted (2026-09-07, with the roster module, ticket 03)

## Context

Whether a waiter works a given shift on a given date is decided by four things:
the business's opening policy for that date, the waiter's holidays, the generated
schedule, and the waiter's weekly pattern. Before the roster module these rules
lived in a global `worksShift`, and the opening policy was not among them at all
— a day was "closed" only in the sense that the schedule generator skipped it, so
a closure was baked into the generated rows rather than being a rule the screens
could apply on their own.

That leaves a gap the owner feels directly: if the business decides to close a day
*after* the schedule was generated, the generated rows — and, where there is no
row, the weekly pattern — still say people work. The closure has nowhere to take
effect without regenerating.

## Decision

The roster resolves eligibility in this order, and the earlier rule wins:

1. **Opening policy.** If the shift does not operate that date under the opening
   policy → no.
2. **Holiday.** If the waiter is on holiday that date → no.
3. **Generated schedule.** If the generated schedule has an entry for that waiter
   on that date → it decides (an entry that omits the shift means "no").
4. **Weekly pattern.** Otherwise their weekly pattern decides.

The opening policy resolves a date by **per-date override → weekday entry →
`full`**, across three modes: `closed` (no shift runs), `opening-only` (only the
first enabled shift runs), and `full` (every enabled shift runs).

## Consequence

Within the roster, closing a day takes effect immediately, without regenerating the
schedule. Because the opening policy is checked *before* the generated schedule and
the weekly pattern, a stale generated row — or a standing weekly pattern — can never
resurrect a shift the business has stopped running. This is the property the owner
cares about, and it is why the opening policy is the first gate rather than the last.

## Realization status (as of 2026-09-07, roster module tickets 03–08)

The precedence above is **in force inside the roster**, but the application does not
yet exercise its variable part. `buildRoster` supplies a fixed special-weekday policy
(`SPECIAL_WEEKDAY_POLICY` — every Sunday opening-only, no per-date overrides), because
the only owner-facing opening control today is the shiftmaker's throwaway,
generation-time Sunday settings, which are never persisted or read at display time.

So the owner-facing capability this ADR describes — closing (or fully opening) a day
*after* generation and having every screen honour it at once — is **latent, not yet
reachable through the UI**. Two consequences follow directly from the fixed constant:
a day configured and generated as *full* still renders as opening-only (the generated
rows are suppressed by the first gate), and a *closed* day can only be expressed the
old way, by the generator baking empty rows. Persisting the opening policy and feeding
it to `buildRoster` — tracked as ticket 09 (`.scratch/roster-module/issues/09-persist-opening-policy.md`)
— is what makes this capability real; update this note when it lands.

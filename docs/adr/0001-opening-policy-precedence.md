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

Closing a day takes effect immediately, without regenerating the schedule. Because
the opening policy is checked *before* the generated schedule and the weekly
pattern, a stale generated row — or a standing weekly pattern — can never resurrect
a shift the business has stopped running. This is the property the owner cares
about, and it is why the opening policy is the first gate rather than the last.

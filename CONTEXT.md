# Roster

The Osmica roster is the one module that answers "who works which shift on a
given date," so every screen agrees. It takes the business's configuration — the
opening policy and the enabled shifts — as input, so the same rules serve a café,
a restaurant or a shop. The precedence between the rules it applies is recorded in
[ADR-0001](docs/adr/0001-opening-policy-precedence.md); this file names the terms,
not that decision.

## Language

**Roster**:
The single source of truth for who works what shift when. It answers in shift
keys, leaving labels and times to the screens.
_Avoid_: rota; schedule (the _generated schedule_ is a separate input, below)

**Shift**:
A named block of the working day, identified by its key — `jutro`, `međusmjena`,
`popodne` — never by its label. The shifts run in a fixed order.
_Avoid_: slot, period

**Generated schedule**:
The concrete per-date, per-waiter shift assignments the shiftmaker produces and
stores. It is one input the roster weighs, distinct from the roster itself and
from a waiter's weekly pattern.
_Avoid_: roster, plan

**Opening policy**:
The business's rule for which shifts a date runs, independent of any single
waiter, expressed in three modes — `closed`, `opening-only`, `full`. It is the
first gate on eligibility (ADR-0001).
_Avoid_: hours, closures, availability

**Opening-only**:
The opening-policy mode in which only the first enabled shift runs that day: the
business opens for one shift rather than the full day.
_Avoid_: morning-only (the shift is whichever is enabled first, not necessarily the morning one)

**Enabled shifts**:
The shifts the business runs at all, in running order. Narrowing them by a date's
opening policy gives that date's _running shifts_.
_Avoid_: active shifts ("active" is a per-waiter, per-date word — see Coverage)

**Special weekday**:
A weekday the opening policy singles out from the plain Monday–Saturday default.
Named for the role, not the day, because the day *is* configuration: it is stored
per café in `business_config` (coffee shop → Sunday, restaurant → Monday, retail →
Sunday by default) and the owner changes it, its default mode and per-date
exceptions on the Radno vrijeme settings screen.
_Avoid_: Sunday, weekend

**Coverage**:
Who is actually working a shift on a date — the waiters the roster says work it,
minus anyone an approved day off has removed. A **gap** is a running shift whose
coverage is zero, as distinct from a shift that does not run that date at all.
_Avoid_: staffing, attendance

**Standing**:
The day-off request that stands against one of a waiter's shifts on a date, or
none. Its status carries the state — `open`, `pending_approval`, `approved` — and
a whole-day request (`oboje`) stands against any of that day's shifts.
_Avoid_: status (that is the field on the request; the request itself is its standing)

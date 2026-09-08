// The repository's first test suite. Run it with one command and no install,
// and with no package manifest: Node (>= 22.7) detects the ES-module syntax in
// these plain .js files on its own.
//
//     node --test
//
// It exercises the roster through its constructor and its questions — never its
// internals, never the DOM, never UI copy. Where a test is only about how the
// opening policy resolves, it uses neutral shift keys and drives "works" through
// the generated schedule, so the assertion is about the rule and not about the
// domain's shift names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOfWeek } from './dates.js';
import {
  createRoster,
  OPENING_CLOSED,
  OPENING_ONLY,
  OPENING_FULL,
} from './roster.js';

// A waiter whose generated schedule says they work every neutral shift on the
// given date — so any absence in the answer is the opening policy talking.
function scheduledWaiter(id, iso, shifts) {
  return {
    waiter: { id, pattern: { m: [], s: [], a: [] }, vacations: [] },
    schedule: { [iso]: { [id]: shifts } },
  };
}

const MON = '2026-09-07'; // dayOfWeek 0
const SUN = '2026-09-13'; // dayOfWeek 6

test('dates.js fixtures still map to the weekdays the tests assume', () => {
  assert.equal(dayOfWeek(MON), 0);
  assert.equal(dayOfWeek(SUN), 6);
});

// ── Opening policy resolution ────────────────────────────────────────────────

test('with no policy every enabled shift runs (defaults to full)', () => {
  const { waiter, schedule } = scheduledWaiter('w1', MON, ['a', 'b', 'c']);
  const roster = createRoster({ schedule, enabledShifts: ['a', 'b', 'c'] });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['a', 'b', 'c']);
});

test('a closed date runs no shift', () => {
  const { waiter, schedule } = scheduledWaiter('w1', MON, ['a', 'b', 'c']);
  const roster = createRoster({
    schedule,
    enabledShifts: ['a', 'b', 'c'],
    openingPolicy: { overrides: { [MON]: OPENING_CLOSED } },
  });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), []);
});

test('an opening-only date runs just the first enabled shift', () => {
  const { waiter, schedule } = scheduledWaiter('w1', MON, ['a', 'b', 'c']);
  const roster = createRoster({
    schedule,
    enabledShifts: ['a', 'b', 'c'],
    openingPolicy: { overrides: { [MON]: OPENING_ONLY } },
  });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['a']);
});

test('opening-only keeps the first *enabled* shift, not a fixed one', () => {
  const { waiter, schedule } = scheduledWaiter('w1', MON, ['b', 'c']);
  const roster = createRoster({
    schedule,
    enabledShifts: ['b', 'c'],
    openingPolicy: { overrides: { [MON]: OPENING_ONLY } },
  });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['b']);
});

test('a weekday entry applies to every date of that weekday', () => {
  const enabledShifts = ['a', 'b', 'c'];
  const openingPolicy = { weekday: { 6: OPENING_ONLY } }; // Sundays: opening-only
  const sun = scheduledWaiter('w1', SUN, ['a', 'b', 'c']);
  const mon = scheduledWaiter('w1', MON, ['a', 'b', 'c']);
  const roster = createRoster({
    schedule: { ...sun.schedule, ...mon.schedule },
    enabledShifts,
    openingPolicy,
  });
  assert.deepEqual(roster.shiftsWorked(sun.waiter, SUN), ['a']);
  assert.deepEqual(roster.shiftsWorked(mon.waiter, MON), ['a', 'b', 'c']);
});

test('a per-date override beats the weekday entry', () => {
  const { waiter, schedule } = scheduledWaiter('w1', SUN, ['a', 'b', 'c']);
  const roster = createRoster({
    schedule,
    enabledShifts: ['a', 'b', 'c'],
    openingPolicy: {
      weekday: { 6: OPENING_CLOSED }, // Sundays closed by default…
      overrides: { [SUN]: OPENING_FULL }, // …but this one is fully open.
    },
  });
  assert.deepEqual(roster.shiftsWorked(waiter, SUN), ['a', 'b', 'c']);
});

// ── ADR-0001 precedence ──────────────────────────────────────────────────────

test('a closed day cannot be resurrected by a stale generated row', () => {
  // The consequence the owner cares about: the schedule says the waiter works,
  // but the business has since closed the day, and closing wins immediately.
  const { waiter, schedule } = scheduledWaiter('w1', MON, ['a', 'b', 'c']);
  const roster = createRoster({
    schedule,
    enabledShifts: ['a', 'b', 'c'],
    openingPolicy: { overrides: { [MON]: OPENING_CLOSED } },
  });
  assert.equal(roster.worksShift(waiter, MON, 'a'), false);
});

test('holiday beats both the generated schedule and the weekly pattern', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [], a: [] },
    vacations: [{ from: '2026-09-01', to: '2026-09-30' }],
  };
  const roster = createRoster({
    schedule: { [MON]: { w1: ['jutro'] } },
    enabledShifts: ['jutro'],
  });
  assert.equal(roster.onHoliday(waiter, MON), true);
  assert.equal(roster.worksShift(waiter, MON, 'jutro'), false);
});

test('a generated schedule row decides over the weekly pattern', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, // pattern: no morning
    vacations: [],
  };
  const roster = createRoster({
    schedule: { [MON]: { w1: ['jutro'] } }, // …but the schedule adds it
    enabledShifts: ['jutro'],
  });
  assert.equal(roster.worksShift(waiter, MON, 'jutro'), true);
});

test('a generated row for the date removes a shift it omits', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [], a: [] }, // pattern: morning on
    vacations: [],
  };
  const roster = createRoster({
    schedule: { [MON]: { w1: [] } }, // present but empty → decides "no"
    enabledShifts: ['jutro'],
  });
  assert.equal(roster.worksShift(waiter, MON, 'jutro'), false);
});

test('with no schedule row the weekly pattern decides', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [], a: [] }, // Monday morning only
    vacations: [],
  };
  const roster = createRoster({ enabledShifts: ['jutro'] });
  assert.equal(roster.worksShift(waiter, MON, 'jutro'), true);
  assert.equal(roster.worksShift(waiter, '2026-09-08', 'jutro'), false); // Tue
});

test('the mid and afternoon shifts have no Sunday pattern', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [], s: [1, 1, 1, 1, 1, 1, 1], a: [1, 1, 1, 1, 1, 1, 1] },
    vacations: [],
  };
  const roster = createRoster({ enabledShifts: ['međusmjena', 'popodne'] });
  assert.equal(roster.worksShift(waiter, SUN, 'međusmjena'), false);
  assert.equal(roster.worksShift(waiter, SUN, 'popodne'), false);
});

// ── onHoliday ────────────────────────────────────────────────────────────────

test('onHoliday spans the inclusive range and ignores incomplete entries', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [], s: [], a: [] },
    vacations: [
      { from: '2026-09-05', to: '2026-09-10' },
      { from: '2026-09-20', to: null }, // incomplete → ignored
    ],
  };
  const roster = createRoster({});
  assert.equal(roster.onHoliday(waiter, '2026-09-05'), true); // first day
  assert.equal(roster.onHoliday(waiter, MON), true); // inside
  assert.equal(roster.onHoliday(waiter, '2026-09-10'), true); // last day
  assert.equal(roster.onHoliday(waiter, '2026-09-11'), false); // after
  assert.equal(roster.onHoliday(waiter, '2026-09-20'), false); // incomplete
});

test('a waiter with no vacations is never on holiday', () => {
  const roster = createRoster({});
  assert.equal(roster.onHoliday({ id: 'w1', pattern: {} }, MON), false);
});

// ── Fresh construction, no shared state ──────────────────────────────────────

test('each roster answers from its own snapshot, with nothing shared', () => {
  const waiter = { id: 'w1', pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] };
  const working = createRoster({
    schedule: { [MON]: { w1: ['jutro'] } },
    enabledShifts: ['jutro'],
  });
  const notWorking = createRoster({ enabledShifts: ['jutro'] });
  assert.equal(working.worksShift(waiter, MON, 'jutro'), true);
  assert.equal(notWorking.worksShift(waiter, MON, 'jutro'), false);
});

// ── shiftsWorked ─────────────────────────────────────────────────────────────

test('shiftsWorked returns the worked shifts in running order', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0], a: [1, 0, 0, 0, 0, 0] },
    vacations: [],
  };
  const roster = createRoster({ enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['jutro', 'popodne']);
});

test('shiftsWorked is empty on a holiday', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [], a: [] },
    vacations: [{ from: '2026-09-01', to: '2026-09-30' }],
  };
  const roster = createRoster({ enabledShifts: ['jutro'] });
  assert.deepEqual(roster.shiftsWorked(waiter, MON), []);
});

// ── coverableShifts (ticket 04) ──────────────────────────────────────────────
//
// Regression: the request screen used to offer a shift the business does not run
// that day. On the special weekday (opening-only) only the first shift runs, so
// the mid and afternoon shifts must never be offered as coverable there.

test('coverableShifts on an opening-only day offers only the shift that runs', () => {
  const waiter = { id: 'w1', pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] };
  const roster = createRoster({
    enabledShifts: ['jutro', 'međusmjena', 'popodne'],
    openingPolicy: { weekday: { 6: OPENING_ONLY } }, // Sundays: opening-only
  });
  // The waiter works nothing that Sunday, but only morning runs — so morning is
  // the only shift they could cover; mid and afternoon are never offered.
  assert.deepEqual(roster.coverableShifts(waiter, SUN), ['jutro']);
});

test('the special-weekday policy is what removes mid/afternoon from a Sunday offer', () => {
  // Regression contrast, at the seam the fix turns on. With a full policy the
  // shifts that don't run Sunday still fall through as coverable — the shape of
  // the old bug. Marking Sunday opening-only is exactly what closes it.
  const waiter = { id: 'w1', pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] };
  const enabledShifts = ['jutro', 'međusmjena', 'popodne'];
  const full = createRoster({ enabledShifts, openingPolicy: {} });
  const special = createRoster({ enabledShifts, openingPolicy: { weekday: { 6: OPENING_ONLY } } });
  assert.deepEqual(full.coverableShifts(waiter, SUN), ['jutro', 'međusmjena', 'popodne']);
  assert.deepEqual(special.coverableShifts(waiter, SUN), ['jutro']);
});

test('coverableShifts excludes the shifts the waiter already works', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0], a: [0, 0, 0, 0, 0, 0] },
    vacations: [],
  };
  const roster = createRoster({ enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  // Monday runs full; the waiter works morning, so they could cover the other two.
  assert.deepEqual(roster.coverableShifts(waiter, MON), ['međusmjena', 'popodne']);
});

test('coverableShifts is empty on a closed day', () => {
  const waiter = { id: 'w1', pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] };
  const roster = createRoster({
    enabledShifts: ['jutro', 'međusmjena', 'popodne'],
    openingPolicy: { overrides: { [MON]: OPENING_CLOSED } },
  });
  assert.deepEqual(roster.coverableShifts(waiter, MON), []);
});

// ── standing (ticket 04) ─────────────────────────────────────────────────────

test('standing returns the request against a shift and its state, or null', () => {
  const waiter = { id: 'w1', pattern: { m: [], s: [], a: [] }, vacations: [] };
  const requests = [
    { waiterId: 'w1', date: MON, shift: 'jutro', status: 'open' },
    { waiterId: 'w1', date: SUN, shift: 'oboje', status: 'approved' },
    { waiterId: 'w2', date: MON, shift: 'jutro', status: 'open' },
  ];
  const roster = createRoster({ requests });
  assert.equal(roster.standing(waiter, MON, 'jutro')?.status, 'open');
  // 'oboje' is the whole-day request and stands against any of that day's shifts.
  assert.equal(roster.standing(waiter, SUN, 'popodne')?.status, 'approved');
  assert.equal(roster.standing(waiter, MON, 'popodne'), null); // no request for it
  assert.equal(roster.standing(waiter, '2026-09-20', 'jutro'), null); // other date
  assert.equal(roster.standing(waiter, MON, 'jutro').waiterId, 'w1'); // not w2's
});

// ── coverage: activeStaff / coverageCount / openRequests (ticket 05) ────────────
//
// The three owner views — home gap rows, the week view, the day detail sheet —
// used to each carry their own copy of the coverage maths, and they had drifted:
// the gap rows counted raw pattern workers and never subtracted an approved day
// off, so a shift covered only by someone who had been given the day off read as
// staffed there while the day detail read it as empty. These questions are the
// one place the maths now lives, so every view agrees.
//
// The not-operating sentinel: a shift that does not run that day answers null,
// not [] / 0. That is how a view tells "runs but nobody covers it" (a gap) from
// "does not run at all" (blank / skipped), and how the day detail resolves its
// operating shifts through the opening policy instead of a hard-coded rule.

const scheduleOn = (iso, id, shifts) => ({ [iso]: { [id]: shifts } });

test('activeStaff lists the waiters working a shift, in roster order', () => {
  const waiters = [
    { id: 'a', pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] },
    { id: 'b', pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] },
    { id: 'c', pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [], a: [] }, vacations: [] },
  ];
  const roster = createRoster({ waiters, enabledShifts: ['jutro'] });
  assert.deepEqual(roster.activeStaff(MON, 'jutro').map(w => w.id), ['a', 'b']);
  assert.equal(roster.coverageCount(MON, 'jutro'), 2);
});

test('coverage counts active staff — an approved day off drops the shift to a gap', () => {
  // The exact divergence this ticket closes: the only worker has an approved day
  // off, so the shift runs but nobody covers it. Coverage is 0 (a gap), not the
  // raw pattern count of 1 the home gap rows used to report.
  const waiters = [{ id: 'w1', pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [], a: [] }, vacations: [] }];
  const requests = [{ waiterId: 'w1', date: MON, shift: 'jutro', status: 'approved' }];
  const roster = createRoster({ waiters, requests, enabledShifts: ['jutro'] });
  assert.deepEqual(roster.activeStaff(MON, 'jutro').map(w => w.id), []);
  assert.equal(roster.coverageCount(MON, 'jutro'), 0); // a gap, not null
});

test('a whole-day approved request removes the waiter from every shift that day', () => {
  const waiters = [{
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [1, 1, 1, 1, 1, 1, 1], a: [1, 1, 1, 1, 1, 1, 1] },
    vacations: [],
  }];
  const requests = [{ waiterId: 'w1', date: MON, shift: 'oboje', status: 'approved' }];
  const roster = createRoster({ waiters, requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  assert.equal(roster.coverageCount(MON, 'jutro'), 0);
  assert.equal(roster.coverageCount(MON, 'međusmjena'), 0);
  assert.equal(roster.coverageCount(MON, 'popodne'), 0);
});

test('a pending (not yet approved) request leaves the waiter counted as covering', () => {
  // Only an approved day off removes someone from the count. An open request is a
  // gap warning, but until it is granted the person is still on the shift.
  const waiters = [{ id: 'w1', pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [], a: [] }, vacations: [] }];
  const requests = [{ waiterId: 'w1', date: MON, shift: 'jutro', status: 'open' }];
  const roster = createRoster({ waiters, requests, enabledShifts: ['jutro'] });
  assert.equal(roster.coverageCount(MON, 'jutro'), 1);
});

test('openRequests returns only the open gap warnings against a shift', () => {
  const requests = [
    { waiterId: 'w1', date: MON, shift: 'jutro', status: 'open' },
    { waiterId: 'w2', date: MON, shift: 'oboje', status: 'open' }, // whole-day, stands against jutro
    { waiterId: 'w3', date: MON, shift: 'jutro', status: 'approved' }, // granted → not open
    { waiterId: 'w4', date: MON, shift: 'jutro', status: 'pending_approval' }, // being covered → not open
    { waiterId: 'w6', date: MON, shift: 'jutro', status: 'cover_rejected' }, // coverer fell through → not 'open'
    { waiterId: 'w5', date: SUN, shift: 'jutro', status: 'open' }, // other date
  ];
  const roster = createRoster({ requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  // Only status 'open' counts, matching the week view's prior filter — not
  // 'pending_approval', 'approved', or 'cover_rejected'.
  assert.deepEqual(roster.openRequests(MON, 'jutro').map(r => r.waiterId), ['w1', 'w2']);
});

test('coverage and pending answer null for a shift that does not operate that day', () => {
  const waiters = [{
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [1, 1, 1, 1, 1, 1, 1], a: [1, 1, 1, 1, 1, 1, 1] },
    vacations: [],
  }];
  const requests = [{ waiterId: 'w1', date: MON, shift: 'popodne', status: 'open' }];
  const roster = createRoster({
    waiters,
    requests,
    enabledShifts: ['jutro', 'međusmjena', 'popodne'],
    openingPolicy: { overrides: { [MON]: OPENING_ONLY } }, // only the first shift runs
  });
  assert.equal(roster.coverageCount(MON, 'jutro'), 1); // runs, covered
  assert.equal(roster.activeStaff(MON, 'međusmjena'), null); // does not run
  assert.equal(roster.coverageCount(MON, 'popodne'), null); // does not run
  assert.equal(roster.openRequests(MON, 'popodne'), null); // does not run → not a gap
  assert.deepEqual(roster.openRequests(MON, 'jutro'), []); // runs, no open request
});

// The named regression for behaviour change 3. The day detail sheet used to
// hard-code "the special day (Sunday) means morning only", so which shifts a
// coverage view shows was a fixed function of the weekday. The fix is that the
// coverage views resolve operating shifts through the *opening policy* instead.
//
// The DOM hard-code itself lives in osmica.html (openDayDetail), which the suite
// deliberately never touches (see the header). What this test pins is the roster
// behaviour that removal now depends on: coverage follows the configured policy,
// not the calendar weekday. Two contrasts make that unmistakable — the same date
// answers differently under two policies (so it is the policy, not the day, that
// decides), and a policy on a *non-Sunday* weekday takes effect (which a Sunday
// hard-code could never express).
test('behaviour change 3: coverage resolves operating shifts through the opening policy, not a hard-coded Sunday', () => {
  const waiters = [{
    id: 'w1',
    pattern: { m: [1, 1, 1, 1, 1, 1, 1], s: [1, 1, 1, 1, 1, 1, 1], a: [1, 1, 1, 1, 1, 1, 1] },
    vacations: [],
  }];
  const enabledShifts = ['jutro', 'međusmjena', 'popodne'];

  // Same Monday, two policies: it is the policy that flips mid/afternoon between
  // counted and not-operating, not anything about the date.
  const full = createRoster({ waiters, enabledShifts, openingPolicy: {} });
  const monSpecial = createRoster({ waiters, enabledShifts, openingPolicy: { weekday: { 0: OPENING_ONLY } } });
  assert.equal(full.coverageCount(MON, 'međusmjena'), 1); // full → mid runs and is covered
  assert.equal(full.coverageCount(MON, 'popodne'), 1);
  assert.equal(monSpecial.coverageCount(MON, 'međusmjena'), null); // opening-only → mid does not operate
  assert.equal(monSpecial.coverageCount(MON, 'popodne'), null);

  // And the special weekday can be Monday — a restaurant, not a café — which the
  // old Sunday-only hard-code could not represent. Its ordinary days still run full.
  assert.equal(monSpecial.coverageCount(MON, 'jutro'), 1); // the one shift a special Monday keeps
  const TUE = '2026-09-08';
  assert.equal(monSpecial.coverageCount(TUE, 'međusmjena'), 1);
  assert.equal(monSpecial.coverageCount(TUE, 'popodne'), 1);
});

// ── shiftsActive: the waiter month grid, after an approved day off (ticket 06) ──
//
// shiftsWorked answers who the roster *rosters* for a date (ADR-0001); shiftsActive
// is that minus the shifts an approved day off has taken the waiter off — the
// per-waiter mirror of the coverage views' approved-off subtraction. The waiter
// month grid reads it so a granted day off actually clears the cell.
//
// The DOM the fix removes lives in osmica.html (renderMonthView), which the suite
// never touches (see the header). What these two named regressions pin is the
// roster behaviour that removal depends on. Each contrasts shiftsActive against
// shiftsWorked, which is the exact shape of the old grid's bug: the grid derived
// absence by hand and still counted a shift an approved day off had cleared.

// The named regression for behaviour change 1. The old grid cleared only morning
// and afternoon on an approved day off — never the mid shift — so a waiter granted
// the mid shift off still showed as working it.
test('behaviour change 1: an approved day off covering the mid shift clears it', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [0, 0, 0, 0, 0, 0, 0], s: [1, 0, 0, 0, 0, 0], a: [0, 0, 0, 0, 0, 0] }, // Monday mid only
    vacations: [],
  };
  const requests = [{ waiterId: 'w1', date: MON, shift: 'međusmjena', status: 'approved' }];
  const roster = createRoster({ requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  // The roster still rosters the mid shift (the pattern) — the shape without the fix…
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['međusmjena']);
  // …but the granted day off clears it, mid included.
  assert.deepEqual(roster.shiftsActive(waiter, MON), []);
});

// The named regression for behaviour change 2. The old grid found the first
// approved request only (Array.find), so a waiter with two separate approvals on
// one date had only the first honoured.
test('behaviour change 2: every approved request on a date is honoured, not only the first', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0], a: [1, 0, 0, 0, 0, 0] }, // Monday morning + afternoon
    vacations: [],
  };
  const requests = [
    { waiterId: 'w1', date: MON, shift: 'jutro', status: 'approved' },
    { waiterId: 'w1', date: MON, shift: 'popodne', status: 'approved' },
  ];
  const roster = createRoster({ requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  // Both shifts are rostered — the shape without the fix, where only the first
  // approval was found and cleared…
  assert.deepEqual(roster.shiftsWorked(waiter, MON), ['jutro', 'popodne']);
  // …with the fix both approvals are honoured and the waiter is fully off.
  assert.deepEqual(roster.shiftsActive(waiter, MON), []);
});

test('shiftsActive leaves a shift a pending (not yet approved) request stands against', () => {
  // Only an approved day off clears a shift from the waiter's own grid; an open
  // request is shown with the pending dot but the shift still reads as worked.
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0], a: [0, 0, 0, 0, 0, 0] },
    vacations: [],
  };
  const requests = [{ waiterId: 'w1', date: MON, shift: 'jutro', status: 'open' }];
  const roster = createRoster({ requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  assert.deepEqual(roster.shiftsActive(waiter, MON), ['jutro']);
});

test('a whole-day approved request clears every shift from shiftsActive', () => {
  const waiter = {
    id: 'w1',
    pattern: { m: [1, 0, 0, 0, 0, 0, 0], s: [1, 0, 0, 0, 0, 0], a: [1, 0, 0, 0, 0, 0] },
    vacations: [],
  };
  const requests = [{ waiterId: 'w1', date: MON, shift: 'oboje', status: 'approved' }];
  const roster = createRoster({ requests, enabledShifts: ['jutro', 'međusmjena', 'popodne'] });
  assert.deepEqual(roster.shiftsActive(waiter, MON), []);
});

// ── Ticket 09: the opening policy is now stored, and generation and display read
//    the same copy of it. These pin the two ADR-0001 properties the app could not
//    reach while buildRoster fed a frozen SPECIAL_WEEKDAY_POLICY constant. ─────────

// The proven full-special-day suppression bug, pinned. A Sunday the owner
// configured and generated as *full* has all its rows in the schedule, but the
// old frozen policy (Sunday = opening-only, no overrides) suppressed every shift
// past the first on display. This test both reproduces that suppression under the
// frozen policy and shows the stored override policy fixes it — the assertion is
// the exact contrast from the ticket, confirmed failing against the pre-fix
// constant on the first line and correct on the second.
test('ticket 09: a full special day renders every generated shift, not only the opening one', () => {
  const { waiter, schedule } = scheduledWaiter('w1', SUN, ['jutro', 'popodne']);
  const enabledShifts = ['jutro', 'međusmjena', 'popodne'];

  // The pre-fix constant buildRoster used to pass: every Sunday opening-only, no
  // overrides. The afternoon row the generator wrote is hidden by the first gate.
  const frozen = createRoster({
    schedule, enabledShifts,
    openingPolicy: { weekday: { 6: OPENING_ONLY } },
  });
  assert.deepEqual(frozen.shiftsWorked(waiter, SUN), ['jutro']); // the bug: afternoon suppressed

  // The stored policy this ticket makes reachable: the same weekday default, plus
  // a per-date override marking this Sunday full. Now the afternoon row shows.
  const stored = createRoster({
    schedule, enabledShifts,
    openingPolicy: { weekday: { 6: OPENING_ONLY }, overrides: { [SUN]: OPENING_FULL } },
  });
  assert.deepEqual(stored.shiftsWorked(waiter, SUN), ['jutro', 'popodne']); // fixed
});

// The ADR-0001 "close a day and every screen honours it at once" property, now
// reachable: a stored closed override empties the coverage the display reads,
// independent of whether the schedule was regenerated (the rows are still there).
test('ticket 09: a stored closed override hides staff live, without regenerating', () => {
  const waiters = [{ id: 'w1', pattern: { m: [], s: [], a: [] }, vacations: [] }];
  const schedule = { [SUN]: { w1: ['jutro', 'međusmjena', 'popodne'] } };
  const enabledShifts = ['jutro', 'međusmjena', 'popodne'];

  const open = createRoster({ waiters, schedule, enabledShifts, openingPolicy: {} });
  assert.equal(open.coverageCount(SUN, 'jutro'), 1); // rows staff the day…

  const closed = createRoster({
    waiters, schedule, enabledShifts,
    openingPolicy: { overrides: { [SUN]: OPENING_CLOSED } },
  });
  // …but a stored closure empties every shift, without the rows being deleted.
  assert.equal(closed.coverageCount(SUN, 'jutro'), null);
  assert.deepEqual(closed.shiftsWorked(waiters[0], SUN), []);
});

// runningShifts is the roster answer the generator now shares with display, so the
// two resolve one policy. It returns the running shifts in order, or [] for closed.
test('ticket 09: runningShifts resolves the policy the generator and display share', () => {
  const enabledShifts = ['jutro', 'međusmjena', 'popodne'];
  const roster = createRoster({
    enabledShifts,
    openingPolicy: {
      weekday: { 6: OPENING_ONLY },
      overrides: { '2026-09-06': OPENING_CLOSED, [SUN]: OPENING_FULL },
    },
  });
  assert.deepEqual(roster.runningShifts(MON), enabledShifts);          // ordinary day → full
  assert.deepEqual(roster.runningShifts('2026-09-20'), ['jutro']);     // a plain Sunday → opening-only
  assert.deepEqual(roster.runningShifts(SUN), enabledShifts);          // override → full
  assert.deepEqual(roster.runningShifts('2026-09-06'), []);            // override → closed
});

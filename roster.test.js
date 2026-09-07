// The repository's first test suite. Run it with one command and no install:
//
//     node --test        (or: npm test)
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

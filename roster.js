// The roster module owns the rules about who works what shift on a given date.
// It is built fresh, per render, from a snapshot of the current data plus the
// business configuration — there is no cached instance and no invalidation
// rule: a new render means a new roster. Callers ask it domain questions and
// never re-derive eligibility by hand.
//
// Presentation stays out. The roster answers in shift *keys* (the same keys the
// data uses); labels, times and numerals (I/II/III) live in the screens.
//
// The precedence rule these questions follow is recorded as ADR-0001
// (docs/adr/0001-opening-policy-precedence.md).

import { dayOfWeek } from './dates.js';

// The shifts the business can run, in running order. The first is the one an
// opening-only day keeps open.
export const ALL_SHIFTS = ['jutro', 'međusmjena', 'popodne'];

// Opening-policy modes for a date:
//   'closed'       — the business does not open; no shift runs.
//   'opening-only' — only the first enabled shift runs.
//   'full'         — every enabled shift runs.
export const OPENING_CLOSED = 'closed';
export const OPENING_ONLY = 'opening-only';
export const OPENING_FULL = 'full';

// createRoster(snapshot) → query functions closed over that snapshot.
//
//   waiters       the waiter roster — part of the documented snapshot; the
//                 coverage questions later tickets add read it. The per-waiter
//                 questions here take their waiter as an argument.
//   requests      the request list — part of the documented snapshot; the
//                 standing / coverage questions later tickets add read it.
//   schedule      the generated schedule index, {iso: {waiterId: [shift,...]}}.
//   openingPolicy {weekday: {dow: mode}, overrides: {iso: mode}} — how each
//                 date resolves; anything unspecified is 'full'.
//   enabledShifts the shifts the business runs at all, a subset of ALL_SHIFTS
//                 in running order.
export function createRoster({
  waiters = [],
  requests = [],
  schedule = {},
  openingPolicy = {},
  enabledShifts = ALL_SHIFTS,
} = {}) {
  const weekday = openingPolicy.weekday || {};
  const overrides = openingPolicy.overrides || {};

  // How the opening policy resolves a single date: a per-date override wins,
  // then the weekday entry, then 'full'.
  function openingMode(iso) {
    if (overrides[iso] !== undefined) return overrides[iso];
    const dow = dayOfWeek(iso);
    if (weekday[dow] !== undefined) return weekday[dow];
    return OPENING_FULL;
  }

  // The shifts the business actually runs on a date, honouring both the opening
  // policy and the enabled-shift list. Opening-only keeps the first enabled one.
  function runningShifts(iso) {
    const mode = openingMode(iso);
    if (mode === OPENING_CLOSED) return [];
    if (mode === OPENING_ONLY) return enabledShifts.slice(0, 1);
    return enabledShifts.slice();
  }

  function operates(iso, shift) {
    return runningShifts(iso).includes(shift);
  }

  function onHoliday(waiter, iso) {
    return (waiter.vacations || []).some(v => v.from && v.to && iso >= v.from && iso <= v.to);
  }

  // The weekly pattern: the fallback when nothing more specific has decided.
  // Morning is keyed for every weekday; the mid and afternoon shifts only carry
  // a Monday–Saturday pattern.
  function worksByPattern(waiter, iso, shift) {
    const dow = dayOfWeek(iso);
    if (shift === 'jutro') return !!waiter.pattern.m[dow];
    if (shift === 'međusmjena') return dow < 6 && !!(waiter.pattern.s || [])[dow];
    if (shift === 'popodne') return dow < 6 && !!waiter.pattern.a[dow];
    return false;
  }

  // Does this waiter work this shift on this date? ADR-0001 precedence:
  //   1. the shift does not operate that date under the opening policy → no;
  //   2. the waiter is on holiday that date → no;
  //   3. the generated schedule has an entry for that waiter that date → it decides;
  //   4. otherwise the weekly pattern decides.
  function worksShift(waiter, iso, shift) {
    if (!operates(iso, shift)) return false;
    if (onHoliday(waiter, iso)) return false;
    const generated = schedule[iso]?.[waiter.id];
    if (generated !== undefined) return generated.includes(shift);
    return worksByPattern(waiter, iso, shift);
  }

  // Which of the enabled shifts this waiter works on this date, in running order.
  function shiftsWorked(waiter, iso) {
    return enabledShifts.filter(shift => worksShift(waiter, iso, shift));
  }

  // The shifts this waiter could volunteer to cover on this date: the ones the
  // business runs that day (opening policy + enabled list) that the waiter does
  // not already work. A shift that does not run that day is never coverable — so
  // the request screen can never offer it.
  function coverableShifts(waiter, iso) {
    return runningShifts(iso).filter(shift => !worksShift(waiter, iso, shift));
  }

  // The standing of a day-off request against one of a waiter's shifts: the
  // request itself (whose .status is the state — open, pending_approval,
  // approved) or null if there is none. A whole-day request ('oboje') stands
  // against any of that day's shifts.
  function standing(waiter, iso, shift) {
    return requests.find(r =>
      r.waiterId === waiter.id && r.date === iso && (r.shift === shift || r.shift === 'oboje')
    ) || null;
  }

  // The questions the screens need. The opening-policy resolution and the
  // running-shift list stay closed over as internals; the coverage questions
  // that read the whole roster arrive with the tickets that need them.
  return { worksShift, onHoliday, shiftsWorked, coverableShifts, standing };
}

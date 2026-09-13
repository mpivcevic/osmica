// Auth-failure status helpers, kept in their own ES module so the app and the
// test runner can import them without loading the application (same pattern as
// dates.js / roster.js). Extracted for the getSession() timeout guard — see
// ADR-0002 (docs/adr/0002-fail-auth-to-retry-screen.md).
//
// Two concerns live here, both pure:
//  - withTimeout: race a promise against a deadline so a stalled auth server
//    can't hang init() forever.
//  - classifyAuthFailure / authFailureMessage: turn (online?, cause) into the
//    one message the single retry screen shows.

// Resolve to the promise's value, or to `sentinel` if `ms` elapses first.
// The timer is cleared in a finally so it can't leak or hold the event loop
// open once the race is decided.
export function withTimeout(promise, ms, sentinel) {
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve(sentinel), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// The classification is testable apart from the wording: offline wins over any
// cause (a device with no network is offline whether the call timed out or
// errored); otherwise the cause carries through.
export function classifyAuthFailure({ online, cause }) {
  if (online === false) return 'offline';
  return cause === 'timeout' ? 'timeout' : 'error';
}

const MESSAGES = {
  offline: 'Nema internetske veze.<br>Provjeri Wi-Fi ili mobilne podatke pa pokušaj ponovo.',
  timeout: 'Poslužitelj trenutačno ne odgovara.<br>Obično je privremeno — pričekaj trenutak i pokušaj ponovo.',
  error: 'Nešto je pošlo po zlu pri povezivanju.<br>Pokušaj ponovo.',
};

// The HTML string for the retry screen, keyed off the classification.
export function authFailureMessage({ online, cause }) {
  return MESSAGES[classifyAuthFailure({ online, cause })];
}

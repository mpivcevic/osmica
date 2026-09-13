import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, authFailureMessage, classifyAuthFailure } from './authstatus.js';

test('withTimeout resolves with the value when the promise wins', async () => {
  const res = await withTimeout(Promise.resolve('who-am-i'), 10000, Symbol('never'));
  assert.equal(res, 'who-am-i');
});

test('withTimeout resolves with the sentinel when the timer wins', async () => {
  const SENTINEL = Symbol('timed-out');
  const res = await withTimeout(new Promise(() => {}), 5, SENTINEL);
  assert.equal(res, SENTINEL);
});

test('classifyAuthFailure: offline wins regardless of cause', () => {
  assert.equal(classifyAuthFailure({ online: false, cause: 'timeout' }), 'offline');
  assert.equal(classifyAuthFailure({ online: false, cause: 'error' }), 'offline');
});

test('classifyAuthFailure: online timeout and online error', () => {
  assert.equal(classifyAuthFailure({ online: true, cause: 'timeout' }), 'timeout');
  assert.equal(classifyAuthFailure({ online: true, cause: 'error' }), 'error');
});

test('authFailureMessage: offline message when offline (any cause)', () => {
  const offline = 'Nema internetske veze.<br>Provjeri Wi-Fi ili mobilne podatke pa pokušaj ponovo.';
  assert.equal(authFailureMessage({ online: false, cause: 'timeout' }), offline);
  assert.equal(authFailureMessage({ online: false, cause: 'error' }), offline);
});

test('authFailureMessage: online + timeout → server message', () => {
  assert.equal(
    authFailureMessage({ online: true, cause: 'timeout' }),
    'Poslužitelj trenutačno ne odgovara.<br>Obično je privremeno — pričekaj trenutak i pokušaj ponovo.'
  );
});

test('authFailureMessage: online + error → generic message', () => {
  assert.equal(
    authFailureMessage({ online: true, cause: 'error' }),
    'Nešto je pošlo po zlu pri povezivanju.<br>Pokušaj ponovo.'
  );
});

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Osmica is a shift-swap / roster PWA for a small hospitality business (café, restaurant, shop). It is a **single-file front end** deployed as static files to GitHub Pages (`mpivcevic.github.io`), backed by Supabase (Postgres + RPCs). There is no framework, bundler, or `package.json`.

## Commands

There is no build step and no install. Node (>= 22.7) runs the ES modules directly; the browser loads the same modules via `<script type="module">`.

```bash
node --test                                   # run the whole test suite
node --test roster.test.js                    # run one test file
node --test --test-name-pattern="opening"     # run tests matching a name
```

Serve locally with any static server from the repo root (e.g. `python3 -m http.server`), then open `osmica.html`. Any host other than `mpivcevic.github.io` automatically talks to the **dev** Supabase project (see below), so a local session cannot touch production data.

## Architecture

- **`osmica.html`** (~246 KB) is the entire application: markup plus one inline `<script type="module">`. Treat it as the app; the `.js` files below are logic extracted out of it so they can be imported and tested headlessly.
- **`roster.js`** — the domain module that answers "who works which shift on a given date," so every screen agrees instead of re-deriving eligibility by hand. Screens build a fresh roster per render and query it. The rule precedence is fixed in **`docs/adr/0001-opening-policy-precedence.md`**; the domain vocabulary (roster, shift, opening policy, coverage, standing, …) is defined in **`CONTEXT.md`** — read it before touching roster logic or naming anything.
- **`dates.js`** — pure date helpers, imported by both the app and the roster module/tests.
- **`sw.js` + `manifest.json` + `index.html`** — the PWA shell. `sw.js` keys its cache on the constant `CACHE` (currently `'osmica-v1'`); bump it when cached static assets must be invalidated.

### Backend selection (important)

`osmica.html` picks the Supabase project **by hostname**: only `location.hostname === 'mpivcevic.github.io'` hits production; everything else (localhost, tunnels) hits dev. This makes it structurally impossible to mutate production from a test session. Both keys are *publishable* and are meant to be public — they are not secrets.

### Supabase migrations

SQL lives in `supabase/migrations/` (production) and `supabase/migrations/dev/` (dev, with `dev` in the filename). They are **applied by hand in the Supabase SQL Editor** — there is no migration runner, so the numbers are documentation, not instructions. Rules (see `supabase/migrations/README.md`):

- **One shared counter across both databases; never reuse a number.** The next migration takes the next free number regardless of which project it targets, so production's sequence will have gaps (a gap means that number went to dev).
- The schema has been progressively hardened: the `anon` role has had columns, writes, and login surfaces revoked; owner-only data (`pin_hash`, `invite_token`, `phone`) is unreachable from a waiter session by table grant, not just by query shape. When editing `.select()` lists or RPCs, assume least-privilege and check what the role can actually reach.

## Security disclosure

This is a **public** repository. Do not commit descriptions of live, exploitable vulnerabilities. Fix the issue first (migration + client change), then describe it in the changelog once it is closed. Security planning docs live at `osmica_security_plan.md` and `osmica_stage_c_plan.md`.

## Releasing

- Bump the in-app version label (`v4.xx`) in `osmica.html` on each release.
- Record user-facing changes in `osmica_changelog.html`.
- Bump `CACHE` in `sw.js` if static assets changed and must not be served stale.

## Agent workflow

See **`AGENTS.md`** for the installed skills, the issue tracker (markdown under `.scratch/<feature-slug>/`, gitignored — issues stay out of the public repo), the triage-label vocabulary, and the domain-doc layout. Keep `CONTEXT.md` the single source of truth for domain language; record hard-to-reverse decisions as ADRs under `docs/adr/`.

## Working with the maintainer

- Respond in English (the domain and some docs are in Croatian; replies are not).
- Warn before large reads/writes that risk losing context mid-task.
- The maintainer runs written task lists independently and reports only deviations — hand off a clear list rather than executing every step interactively.

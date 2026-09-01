# How to Check the Work So Far — and How to Move Forward

**Project:** Osmica
**Date:** 26 August 2026
**Questions:**
1. *"How do I get started? Quality matters to me — what is the main flow I should use to check the work done so far?"*
2. *"What would be the best way to check general quality of what was coded so far and create a way to move forward?"* (asked later the same day)

The second question contains the first and adds a half the first answer did not have.
Checking and moving forward are **two different skills**, and they are not the same branch of the map.

---

## Short answer

| Question | Skill | Branch of the map |
| --- | --- | --- |
| Is what I built any good? | `/improve-codebase-architecture` | Codebase health |
| What do I work on next? | `/triage` | On-ramp |

Run them in that order. Then both merge onto the main flow.

---

## Part 1 — Checking: `/improve-codebase-architecture`

There is no "check" main flow. Checking lives off to the side, and it has exactly one entry point.

The main flow runs **forward**, from idea to shipped code:

```
/grill-with-docs → /to-spec → /to-tickets → /implement
```

Checking runs the opposite direction — look at what is *already* built and judge whether it is well made. That is the **Codebase health** branch.

`/improve-codebase-architecture` is the survey. It walks the codebase, judges how good it is to operate in, and surfaces **deepening opportunities** — the places where the shape is wrong. Picking one *generates an idea*, and that idea is what you carry onto the main flow at `/grill-with-docs`.

### Why not `/code-review`?

`/code-review` is the other checking skill, but it is **not** your starting point.

It reviews a diff *since a fixed point* — a commit, a tag, a branch, a merge-base. You do not have one:

- 96 commits
- all on `main`
- no tags
- no feature branch

### Fix that first — it costs one command

```bash
git tag baseline-2026-08-26
```

Now every future review has an anchor. That is `/code-review`'s real place: the gate on every change **from here on**, which `/implement` already runs automatically before each commit.

---

## Part 2 — Moving forward: `/triage`

This is the half the first answer missed.

`WorkFile.md` is not a to-do list you wrote for an agent. It is a **raw pile of incoming requests**, which is precisely the on-ramp `/triage` exists for:

- product requests — accounting export to Croatian standards, employee types (Student / Regular), phonebook invites, "Zahtjev za GO", part-time licitation
- UI bugs — invite login screen not scaling, login error feedback
- carried-over defects — the `getSession()` timeout, the missing offline shell
- Stage E carve-outs — per-person phone numbers, retention policy, the re-probe, the missing backup story

`/triage` moves each of these through the triage roles and produces **agent-ready issues** as markdown files under `.scratch/<feature-slug>/`, which `/implement` later picks up.

**The one exclusion:** triage is only for issues *you did not create as tickets*. Anything `/to-tickets` produces is already agent-ready — do not send it back through triage. Nothing in `WorkFile.md` came from `/to-tickets`, so the whole file is fair game.

---

## Order, and why

**Survey first, then triage.**

Several backlog items are substantial builds. If the architecture verdict is *"there is no seam to hang a test on — split the file"*, you want that known **before** writing tickets that assume the current single-file shape. Otherwise the tickets get written twice.

---

## Current state of the repo

| Area | State |
| --- | --- |
| **App** | `osmica.html` — **~4,100 lines**, single file |
| **Backend** | 19 production migrations + 6 dev migrations |
| **Security** | Stages A–D closed; Stage E paused |
| **Tests** | **None** |
| **`CONTEXT.md`** | **Missing** — `AGENTS.md` points at it, but it does not exist |
| **`.scratch/`** | **Missing** — no issues filed yet |
| **Tags / branches** | None. All 96 commits on `main` |

---

## Two gaps that will bite before the survey pays off

### 1. No `CONTEXT.md`

Your `AGENTS.md` declares that the domain docs live at `CONTEXT.md` and `docs/adr/`. Neither exists.

Every skill downstream — the survey included — reads that file to learn what your words mean. Without it, each session re-derives *waiter*, *cover*, *shift*, *linked* from scratch, and re-derives them slightly differently each time.

**Good news:** `/grill-with-docs` builds `CONTEXT.md` as a by-product of the first real interview, so this fixes itself on your first pass through the main flow. The survey will simply be sharper if the file already exists.

### 2. Zero tests on ~4,100 lines

This is the real answer to *"I want the app well made at the end."*

An architecture survey tells you where the seams **should** be. Tests are what stop the seams from moving when you are not looking.

A single-file HTML app with no test harness has no seam to hang a test on yet — which is itself the first deepening opportunity the survey will almost certainly find.

---

## The route

```
git tag baseline-2026-08-26        ← gives /code-review an anchor from here on
        │
        ▼
/improve-codebase-architecture     ← the quality check; ranked structural weaknesses
        │
        ▼
/triage   (on WorkFile.md)         ← the way forward; raw pile → agent-ready issues
        │
        │  pick one issue
        ▼
/grill-with-docs                   ← sharpens it; writes CONTEXT.md as it goes
        │
        │  multi-session build?
        ▼
/to-spec → /to-tickets             ← YES: split into tickets under .scratch/
        │                             (/clear context between each ticket)
        ▼
/implement                         ← NO: build it right here
        │
        └─ drives /tdd internally (one red-green slice at a time)
           closes by running /code-review before committing
```

### Context hygiene

Keep the survey, the triage, the grilling, the spec, and the tickets in **one unbroken context window**. Do not `/clear` or `/compact` until after `/to-tickets` — they all need to build on the same thinking.

Each `/implement` then starts **cold**, working only from its ticket. That is by design: each ticket is self-contained, so the previous one's context is disposable.

---

## What not to reach for

**`/wayfinder`.** It is for a huge, foggy effort where the way to the destination is not visible yet — greenfield, or a build too big to hold in one session. You have a working app, a closed security programme, and a concrete written backlog. Wayfinder would be slower and denser for no gain.

---

## Next step

1. `git tag baseline-2026-08-26`
2. Run `/improve-codebase-architecture`. It will read the app and the migrations and come back with a ranked list of what is structurally weak.
3. Run `/triage` against `WorkFile.md` in the same window.

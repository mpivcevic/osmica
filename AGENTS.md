# AGENTS.md

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Tests

Run the suite with one command, no install and no package manifest:

    node --test

Node (>= 22.7) detects the ES-module syntax in the plain `.js` files on its own, so
no `package.json` / `"type": "module"` is needed. The browser loads the same modules
via `<script type="module">`.

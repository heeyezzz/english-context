# Bootstrap note (for agents on any machine)

One rule worth remembering before anything else in this repo:

**Publishing the skill goes through `scripts/ship.mjs` only** (`node scripts/ship.mjs -m "..."`).
It runs the acceptance suite, refuses when origin moved, and rejects rule-layer changes without a
`version:` bump in SKILL.md. On the Mac the standing instruction is "改完、测绿就自动推" — ship without
asking each time. Hand `git commit`/`git push` of this repo is forbidden.

Learner state is NOT in this repo: it lives in `~/.english-context` (private data repo), synced by
`scripts/state-git.mjs` on every ledger write. See `SKILL.md` § Cross-machine setup for first-run.

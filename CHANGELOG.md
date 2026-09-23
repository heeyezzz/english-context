# Changelog

Auto-maintained by scripts/ship.mjs — newest first.

## 1.10.0 — 2026-09-24

v1.10.0: CHANGELOG.md now script-owned — every successful ship auto-prepends an entry (version+date+message); 28 historical entries backfilled from git log; agents never hand-edit the changelog

## 1.9.0 — 2026-09-24 · `65995d7`

v1.9.0: anti-repeat rule — pool now exposes recent (last 5 non-void sessions with topic+targets); SKILL steps 3/4 require angle-change on topic rhyme and redraw on exact target-set repeat (exposure-level, no FAIL gate)

## 1.8.0 — 2026-09-24 · `a9ca915`

v1.8.0: per-tier target quota unified to 4-5 at every tier (TIERS.targets + hard gate maxTargets 6->5); tier now differentiates candidate pool only, not volume

## 1.7.2 — 2026-09-24 · `55abc5d`

v1.7.2: goes-form fix (win-reported) — [sxzo] -es rule guard >4 excluded the exact 4-letter case it exists for; now >3, plus goes in irregular-forms as data defense; regression test locks the grid cell

## 1.7.1 — 2026-09-23 · `f9b00c8`

v1.7.1: stale comment only — passage-check's validatorSignature note still credited step-6 copying to the agent; archive subcommand has owned that since 1.7.0 (main-agent audit tail)

## 1.7.0 — 2026-09-23 · `18f12b4`

v1.7.0: mustReuse sort fixed to longest-unseen-first (doc/code mismatch); stale feel comment corrected; new archive subcommand — step-6 archiving (frontmatter, validatedBy copy, push) fully scripted with passageSha256 integrity check

## 1.6.2 — 2026-09-23 · `90865b2`

v1.6.2: skillUpdate stamp keyed on local HEAD (pull invalidates cache); SKILL step-6 signature sourced only from passage-check report (removed cached-version trap); suite clears EC_UPDATE_CHECK inside node (env.exe shadowing on Win); hash-scope comment for assets/

## 1.6.1 — 2026-09-23 · `10adfaf`

v1.6.1: Win-verified fixes — offline stamps retry after 10min & pool force-refreshes (blind window >=1 passage); ship version-leg baselines on origin/main not HEAD (+regression test); MSYS-safe node -e path via pathToFileURL; passage-check now emits validatedBy signature (version+sha256) for step-6 copy

## 1.6.0 — 2026-09-23 · `64ca4f1`

v1.6.0: script-level skillUpdate check on status/pool, fail-closed ship.mjs (version lint + remote guard), validatedBy archive field, BOOTSTRAP.md; suite 39/39

## 1.5.1 — 2026-09-23 · `f712e7b`

v1.5.1 (win-reported): void unlinks passage BEFORE save so deletion rides its own push; SKILL intro matches archive reality; version 1.4.2->1.5.1

## 1.5.0 — 2026-09-23 · `277e538`

passage archive: pend writes $STATE/passages/<id>.md, void deletes it (v1.5.0, local commit only)

## 1.4.2 — 2026-09-23 · `c574388`

fix: lemma search now consults known/whitelist sets (allocates->allocate) + cannot->can rule (v1.4.2, local)

## 1.4.1 — 2026-09-23 · `b04cbac`

fix: pool fresh keys off exposures==0 so voided words are no longer stranded (win-reported bug); +31 irregular forms incl. said (v1.4.1)

## 1.4.0 — 2026-09-22 · `c90883f`

spacing: same-day exposure lock, short cooldown ladder (1/1/2/3/4d), inFlight/sleeping visibility (v1.4.0, local commit only)

## — — 2026-09-22 · `435cbd3`

tests: move mustReuse coverage to the in-progress window, assert 6/6 words leave it

## 1.3.0 — 2026-09-22 · `d7f1b06`

promotion now requires consecutive flow (① 太简单); ok (i+1 equilibrium) holds the tier (v1.3.0, local commit only)

## 1.2.0 — 2026-09-22 · `e16a8b7`

pool: mustReuse quota for in-progress words (1-5/6, longest-unseen first) + fresh; SKILL step-4 quota 2-3 returnees (v1.2.0, local commit only)

## — — 2026-09-22 · `1ea495d`

remove q-graph viewer from remote (local-only artifact; keep untracked)

## — — 2026-09-22 · `4d2d072`

docs: q-graph run-logic viewer (flowchart/state/dataflow, evidenced)

## 1.1.0 — 2026-09-22 · `5269cd6`

feel as load-type diagnosis: flow/ok/wordy/dense; wordy=vocab lever, dense=syntax calmer (tier kept), <60%=both (v1.1.0)

## 1.0.4 — 2026-09-22 · `7927016`

confirm step: always offer 3-level 体感 scale (太简单/刚好/有点吃力); never guess feel (v1.0.4)

## 1.0.3 — 2026-09-22 · `8915682`

ledger writes auto-commit+push (sync field in every mutation JSON); state-git distinguishes offline vs conflict on push (v1.0.3)

## — — 2026-09-22 · `cddce90`

docs: correct CRLF renormalize recipe (reset --hard, not rm --cached+checkout); .gitattributes self rule

## 1.0.2 — 2026-09-22 · `de707bf`

fix: CRLF-proof ledger pool, unique session ids for CJK topics; add .gitattributes (v1.0.2)

## — — 2026-09-22 · `b34cf92`

docs: install path should be the agent's real skills dir (verified: Hermes per-profile), data path must stay ~/.english-context

## — — 2026-09-22 · `2c644a3`

declare windows platform support + record MSYS path/python3 gotchas (verified on win node22, 20/20)

## — — 2026-09-22 · `4b7c81c`

state-git: locale-proof empty-diff check, offline-tolerant pull

## — — 2026-09-22 · `b70c57f`

add cross-machine ledger sync (state-git.mjs) + Windows setup notes

## 1.0.0 — 2026-09-22 · `967e109`

english-context v1.0.0: SLA-grounded A2 reading generator

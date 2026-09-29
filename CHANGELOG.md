# Changelog

Auto-maintained by scripts/ship.mjs — newest first.

## 1.15.0 — 2026-09-29

v1.15.0: 难度档位细化 —— 6 档单调词池 + 4 档句式阶梯 + 事前协商 + 探针

词汇档 3->6：按 Google N-Gram 词频把 B1/B2 各切三段，逐档并入（726/1452/2178/3010/3842/4675 词，assets/word-bands.tsv 记录来源与推导）。旧档位池子大小本不单调（2178/4675/2497），新阶梯改成包含式严格递增。旧 tier 1（B1 全量）= 新 tier 3，state.version<2 时自动迁移——不迁会让 v1.14.0 台账被读成新档 1（726 词），静默变简单。已在真实台账副本上验证：档 3 / 池 2145 词，与它一直用的 B1 池一致。

句式档 2->4：0 常规 20/12（默认不变）· 1 偏静 18/11 · 2 冷静 16/10 · 3 最静 13/8。首篇 dense 仍落在 16/10（与旧版逐字一致），反复受挫可累积到 13/8（旧版做不到）；平稳篇每 confirm 松一档，恢复渐进而非开关。修掉一个升级 bug：衰减若先于升级执行，反复 dense 会被卡在 2 档。

事前协商（meta.requested）：起草前把四维画像用一句人话讲给学习者，可否决/点菜；他改的那份写 requested，agent 自己那份照写 predicted。两字段分开才能保住两条对账线——predicted->requested 量手估值不值钱（Phase 2 真正缺的数），requested->feel 量这一篇交得合不合意。合成一个字段会让校准回路一起报废。

探针：连续 3 篇 predicted 之和 <=7 且 feel 全 ok -> 下一篇顶一维到 3（轮转 discourse->background->syntax->vocab）。起因是实测 14 篇 counted、体感 14/14 全 ok、tier 一次没动过——只说 ok 的回路等于没有回路，边界测不出来只能探出来。探针仍不改生成参数。

冲突规则：点菜不破硬闸、不动 tier（词池是测量问题，归脚本闸门）；点菜与 syntaxCalm 冲突时以 syntaxCalm 为准（受挫证据压过愿望）。

套件 51->70 条断言，全绿。新增：词带覆盖率、6 档单调性、档 3 == 旧 B1 池、旧档位迁移、句式阶梯升降、requested 透传与形状校验、archive frontmatter 带 requested+difficulty。

## 1.14.0 — 2026-09-29

v1.14.0: mustReuse graduation-priority sort (closest-to-6/6 first, longest-unseen demoted to tiebreaker) + fresh quota tightened 2-3 -> 1-2 — learner-approved after real backlog data (12 passages, 0 graduations, 29 words in queue) reproduced the inflow>drift math; old tiebreaker test kept green, new priority assertion added

## 1.13.0 — 2026-09-28

v1.13.0: 负荷画像与校准回路（Phase 0+1）——四维量规 difficulty-rubric.md；meta.predicted 事前写死（passage-check 形状硬校验）；pend 透存/archive frontmatter 记录；confirm 接受 feel=context（纯诊断，路由同 ok）；pool 输出最近 8 条 predicted-vs-feel 校准对账。画像只记录，不驱动生成参数

## 1.12.0 — 2026-09-26

v1.12.0: bookshelf feature fully removed per learner decision (script, confirm/void hooks, SKILL/format mentions, 7 suite assertions, data-repo artifact + ignore line) — quiz option-letter gate fix and complete-material rule stay, they stand on their own

## 1.11.4 — 2026-09-25

v1.11.4: passage-check skips single-letter tokens (quiz A)/B)/C) option markers are structural, not vocabulary) — found dogfooding the complete-finished-material flow; regression test appends a quiz block to the fixture

## 1.11.3 — 2026-09-25

v1.11.3: SKILL step-5 makes explicit that the validated+archived passage file is the COMPLETE finished material (prose + 生词表 + 重逢词 + 理解题) — bookshelf quiz rendering depends on it; format guide echoes the same for archive --passage

## 1.11.2 — 2026-09-25

v1.11.2: bookshelf renderer — quiz lines no longer duplicated in body paragraphs, ## subheads folded into the 题目 section

## 1.11.1 — 2026-09-25

v1.11.1: fix invisible detail view — router restored #detail with display='' which falls back to the CSS display:none; now block, plus static regression assertion (caught by screenshot dogfooding)

## 1.11.0 — 2026-09-25

v1.11.0: bookshelf — read-only offline local view of the passage archive (single HTML, data baked in, counted-only so pending quiz answers can never leak; tmp+rename atomic write; confirm/void soft-fail hooks + unconditional session-start rebuild; hash-routed list/detail, substring search over body+targets+reunion, click-to-reveal answers; zero external deps)

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

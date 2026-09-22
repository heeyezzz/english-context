---
name: english-context
description: "Use when generating SLA-grounded English reading passages (A2→B1 news style) with an exposure ledger, CEFR hard validation, and Anki 重逢词 recycling. 生成英语阅读材料/来一篇/reading practice/target word recycling."
version: 1.5.1
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [english, reading, sla, cefr, vocabulary, anki]
    category: education
    related_skills: [anki-flashcard]
---

# English-context Reading Generator

Generates one comprehensible-input passage per session (i+1), validated by scripts, and tracks every
word's exposure across sessions in a ledger at `~/.english-context/`. The displayed material is
archived verbatim to `$STATE/passages/<session-id>.md` at pend time (deleted on void) — the chat is
the presentation layer, the archive is the record. **Anki is only ever read, never written**.
Words graduating here can be *proposed* to the sibling `anki-flashcard` skill, never auto-imported.

Theory contracts baked into the rules: 98%-coverage input with ≥2 contextual re-encounters per target
word (token rate ≤4%, calibrated by learner trial), noticed forms (bold + one-line in-context gloss),
interest-driven topic choice (affective filter), and reunion words pulled from Anki to keep old cards
alive in fresh contexts.

`$SKILL_DIR` = directory containing this `SKILL.md`. `$STATE` = `~/.english-context` (override with
`EC_STATE_DIR` or `--state-dir`).

## Session workflow

1. **Init (first run only):** `node "$SKILL_DIR/scripts/ledger.mjs" init`.
2. **Pull ledger + sync Anki (each session, both read-mostly):**
   `node "$SKILL_DIR/scripts/state-git.mjs" pull --state-dir $STATE` — if it reports `conflict`,
   stop and ask the learner which machine's ledger is newer; never auto-merge state.
   Then Anki words:
   `node "$SKILL_DIR/scripts/sync-anki-words.mjs" --out "$STATE/anki-words.json"` then
   `node "$SKILL_DIR/scripts/ledger.mjs" import-anki --file "$STATE/anki-words.json"`. If Anki is closed, continue with the
   last-synced file and say so — never fail a reading session over a missing endpoint.
3. **Topic:** use the user's stated topic; otherwise pick the least-recently-used entry from
   `ledger.mjs status` interests (offer to add new interests from what they enjoy reading).
   Genre defaults to news style; honor requests for story/explanation/dialogue.
4. **Targets:** `ledger.mjs pool --limit 12` returns two lists. Fill the quota: **2–3 words from
   `mustReuse`** (in-progress words whose cooldown has passed and that were not counted today —
   longest-unseen first; skip one only if the topic truly cannot host it) + **2–3 words from `fresh`**
   (never-used tier-level candidates). On a binge day `mustReuse` empties out (everything counted today
   sleeps) — then fill the whole quota from `fresh`; never refuse to generate, and mention
   `inFlight`/`sleeping` when the learner is reading several passages in one day.
   Learner-specified words always win and count toward the quota, but are subject to the same-day lock.
   Reunion words: choose from Anki/graduated words that fit the topic naturally; skip the section
   honestly rather than force ungrammatical cameo sentences.
5. **Draft** the passage per [the format guide](references/passage-format.md), then validate silently:
   write passage + `meta.json` (`{"topic","targets":[],"reunion":[],"names":[]}` — names = proper nouns)
   to temp files and run
   `node "$SKILL_DIR/scripts/passage-check.mjs" --passage <md> --meta <json> --state-dir $STATE`.
   On FAIL: revise and re-check (max 3 attempts) without showing the learner不合格品; on the 4th
   failure report the structural blocker honestly instead of shipping a bad passage.
6. **Pending entry + archive:** after a PASS, `ledger.mjs pend --meta <json>` (records the session as
   `pending`; note the returned session id). Exposures are NOT counted yet. Then write the exact
   displayed material to `$STATE/passages/<session-id>.md` with frontmatter
   (`session, date, topic, targets, reunion, metrics, quiz answers` — see
   [the format guide](references/passage-format.md)), and run
   `node "$SKILL_DIR/scripts/state-git.mjs" push --message "passage <session-id>" --state-dir $STATE`
   so the archive crosses machines immediately. Filenames are unique session ids → append-only, never conflicts in git.
7. **Show** the formatted passage in chat. If `status` shows pending sessions older than today, append
   one gentle line — never nag twice about the same one.
8. **Confirm → count:** when the learner finishes (answers quiz / says 读完了), collect the score plus
   a 体感 in one prompt — always present the four-level load scale so it is one tap to answer:
   「① 太简单(flow) ② 刚好(ok) ③ 生词太多(wordy) ④ 句子太难(dense)」(→ `flow` / `ok` / `wordy` /
   `dense`). Their own phrasing always wins over the scale. Then `ledger.mjs confirm --session <id>
   --score a/b --feel ...` (feel absent and unanswered once → ask once more; still absent → omit the
   flag, never guess). This is the ONLY moment exposure counts. "重写/换主题" → `ledger.mjs void
   --session <id>`; zero accounting, and void also deletes the archived `$STATE/passages/<id>.md`
   (reports `passageRemoved`; the deletion rides the auto-push) — a voided passage leaves no corpse.
9. **Graduation:** `confirm` nominates any target at ≥6 exposures. Present nominations as
   「候选毕业：word (6/6) → 同意？」. On yes: `ledger.mjs graduate --word w`, then ALWAYS offer the
   Anki bridge once per graduated word: it is a fully-contextualized candidate for a permanent
   微语境闪卡 via the `anki-flashcard` skill (propose; that skill's own gate sequence then applies).
10. **Push ledger:** automatic. Every state write (pend/confirm/void/graduate/interest/import-anki)
    commits and pushes itself — the command's JSON carries a `sync` field: `pushed:true` = done;
    `offline:true` = safely committed locally, retried next session; **`conflict:true` = stop and ask
    the learner which machine's ledger wins** (never blind-merge). `--no-sync` opts out for dry runs.

## Cross-machine setup (mac ↔ Windows Hermes)

`$STATE` is a git working copy of a **separate private data repo** (`english-context-data`); the skill
repo itself holds no learner state. On the second machine:

1. Install Node ≥ 18 (scripts use global `fetch`).
2. Clone skill → the skills directory your agent actually loads from (verify before assuming: e.g.
   Hermes per-profile dir `%LOCALAPPDATA%\hermes\profiles\<profile>\skills`, or `~/.agents/skills`),
   clone data repo → `%USERPROFILE%\.english-context` (or `~/.english-context` — `os.homedir()`
   resolves on both OSes; the DATA path must be exactly this, scripts default to it).
3. Anki on the same machine with Agent Connect/AnkiConnect on 127.0.0.1:8766, deck name matching
   `EC_ANKI_DECK` (default `all in one::微语境闪卡`); otherwise reunion words come from the last
   `anki-words.json` synced from either machine.
4. Working rule: pull at session start, push at session end. Offline on both machines at once is the
   only divergence case — step 2 of the workflow handles it by asking the learner.
5. Windows (verified 2026-09-22): all scripts are pure Node and run natively; `tests/acceptance.sh`
   needs MSYS bash, where `mktemp -d` yields `/tmp/...` that native node resolves to `C:\tmp\...` and
   `pwd`-derived `/c/...` paths break `import` — pass drive-style paths (`C:/Users/...`) to node, and
   note `python3` may be a WindowsApps stub; the suite's few python3 uses can be swapped for `node -e`.
   Line endings: if a pre-`.gitattributes` clone shows CRLF files, renormalize with
   `git reset --hard HEAD` (only when `git status` is clean) — do NOT empty the index via
   `git rm --cached -r .` and then `checkout -- .`: pathspec checkout reads the index and fails on it.

## Spacing rules (script-enforced)

| Rule | Value |
|---|---|
| Cooldown ladder | a word may return only after `1/6→1d, 2/6→1d, 3/6→2d, 4/6→3d, 5/6→4d` since its last exposure |
| Same-day lock | **max one exposure per word per calendar day** — a second same-day appearance is still read (and can be a reunion word) but does not increment |
| Consequence | graduation inherently spans ≥6 distinct days; binge reading fills with fresh words instead of massing the same ones |
| Reporting | `confirm` returns `lockedToday` for words that did not count; `pool`/`status` return `inFlight` (words 1–5/6) and `pool` also `sleeping` (in cooldown or counted today) |

## Hard rules (script-enforced; see passage-check.mjs)

- 250–350 words; longest sentence ≤20, average ≤12 words (tightened to ≤16 / ≤10, via
  `--max-sentence 16 --avg-sentence 10`, while `difficulty.syntaxCalm > 0`).
- 4–6 targets, each appearing ≥2× in prose, each bolded at least once.
- Above-level token rate ≤4% (targets only; reunion/whitelist/known words cost no coverage).
- Zero undeclared above-level words: anything above CEFR A2 must be a declared target, reunion word,
  whitelist entry (`assets/allow-extra.txt`), or known word. Numbers/numerals and irregular forms
  are handled; anything else fails.

## Dynamic difficulty

体感 is a **load-type diagnosis**, and each answer pulls a different lever:

| 体感 / 成绩 | 词汇档 tier | 句式 |
|---|---|---|
| flow ① + 正确率 ≥80% | `streakGood++`，**连续 2 次**才 +1 档 | 不变 |
| ok ②（甜区，i+1） | **保持**（甜区就是目标态，不是超标信号）；连击清零 | 不变 |
| wordy ③（生词太多） | 立即 −1 档（下限 1）；连击清零 | 不变 |
| dense ④（句子太难） | **不变**（词汇达标）；连击清零 | `syntaxCalm = 2` |
| 正确率 <60% | −1 档；连击清零 | `syntaxCalm = 2` |

只有「① 太简单」说明这一档的词袋已被吃透（i+0），才允许上调；「② 刚好」是我们追求的平衡点，停在原地。
tier 1→3 控制候选池（B1 → B1+B2 → B2）与目标词数（4–5 → 5–6 → 6–7）。
`syntaxCalm > 0` 时（由 `status`/`pool`/`confirm` 输出的 `syntaxCalm` 字段读出）：起草按单句 ≤16 词、
平均 ≤10 词执行，并且第 5 步的 passage-check 必须带 `--max-sentence 16 --avg-sentence 10` 运行；
每 confirm 一篇自动 −1，归零后恢复常规句式。每次 confirm 至多 ±1 档，不存在连跳。
起始参数由 2026-09-22 试炼校准（5 词、2.5–3.5%、3/3、"偶尔吃力"）。

## Files

```text
SKILL.md
references/passage-format.md      输出模板 + 格式级规则（注释/题目/重逢词写法）
scripts/passage-check.mjs         硬校验（词表/句长/复现/生词率），exit 0/1 + JSON 报告
scripts/ledger.mjs                init|status|pend|confirm|void|graduate|import-anki|pool|interest
scripts/sync-anki-words.mjs       只读拉取 Anki 已学词（Agent Connect 8766）
scripts/state-git.mjs             台账跨机同步：pull(会话开始)/push(会话结束)，分叉时停下问人
assets/cefr-j-words.tsv           CEFR-J/Octanove 词表（拷贝自 anki-flashcard，独立演化）
assets/allow-extra.txt            白名单（已知专业词：sensors 等）
assets/irregular-forms.txt        不规则变化不算超纲
tests/acceptance.sh               验收套件
```

State (survives skill reinstall): `$STATE/state.json`, `$STATE/known-words.txt`,
`$STATE/anki-words.json`, `$STATE/passages/<session-id>.md`（展示过的每篇正文档案：pend 时写入、
void 时删除；append-only 唯一文件名，git 永不冲突，随 ledger 写操作的自动推送跨机同步）。

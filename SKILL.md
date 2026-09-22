---
name: english-context
description: "Use when generating SLA-grounded English reading passages (A2→B1 news style) with an exposure ledger, CEFR hard validation, and Anki 重逢词 recycling. 生成英语阅读材料/来一篇/reading practice/target word recycling."
version: 1.0.1
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [english, reading, sla, cefr, vocabulary, anki]
    category: education
    related_skills: [anki-flashcard]
---

# English-context Reading Generator

Generates one comprehensible-input passage per session (i+1), validated by scripts, and tracks every
word's exposure across sessions in a ledger at `~/.english-context/`. The passage itself is chat-only
markdown — nothing is written to disk as study material, and **Anki is only ever read, never written**.
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
4. **Targets:** `ledger.mjs pool --limit 12` → pick 4–6 relevant to the topic (or accept the user's
   words). Learner-specified words always win. Reunion words: choose from Anki/graduated words that
   fit the topic naturally; skip the section honestly rather than force ungrammatical cameo sentences.
5. **Draft** the passage per [the format guide](references/passage-format.md), then validate silently:
   write passage + `meta.json` (`{"topic","targets":[],"reunion":[],"names":[]}` — names = proper nouns)
   to temp files and run
   `node "$SKILL_DIR/scripts/passage-check.mjs" --passage <md> --meta <json> --state-dir $STATE`.
   On FAIL: revise and re-check (max 3 attempts) without showing the learner不合格品; on the 4th
   failure report the structural blocker honestly instead of shipping a bad passage.
6. **Pending entry:** after a PASS, `ledger.mjs pend --meta <json>` (records the session as
   `pending`; note the returned session id). Exposures are NOT counted yet.
7. **Show** the formatted passage in chat. If `status` shows pending sessions older than today, append
   one gentle line — never nag twice about the same one.
8. **Confirm → count:** when the learner finishes (answers quiz / says 读完了), run
   `ledger.mjs confirm --session <id> --score a/b --feel easy|ok|hard` (feel: use their words; ask
   once if absent). This is the ONLY moment exposure counts. "重写/换主题" → `ledger.mjs void
   --session <id>`; zero accounting.
9. **Graduation:** `confirm` nominates any target at ≥6 exposures. Present nominations as
   「候选毕业：word (6/6) → 同意？」. On yes: `ledger.mjs graduate --word w`, then ALWAYS offer the
   Anki bridge once per graduated word: it is a fully-contextualized candidate for a permanent
   微语境闪卡 via the `anki-flashcard` skill (propose; that skill's own gate sequence then applies).
10. **Push ledger (end of every session, after any confirm/void/graduate/interest change):**
    `node "$SKILL_DIR/scripts/state-git.mjs" push --message "session <id>" --state-dir $STATE`.
    A divergence report goes to the learner, never a silent local-only save.

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

## Hard rules (script-enforced; see passage-check.mjs)

- 250–350 words; longest sentence ≤20, average ≤12 words.
- 4–6 targets, each appearing ≥2× in prose, each bolded at least once.
- Above-level token rate ≤4% (targets only; reunion/whitelist/known words cost no coverage).
- Zero undeclared above-level words: anything above CEFR A2 must be a declared target, reunion word,
  whitelist entry (`assets/allow-extra.txt`), or known word. Numbers/numerals and irregular forms
  are handled; anything else fails.

## Dynamic difficulty

`state.json:difficulty.tier` 1→3. Tier sets the candidate pool (B1 → B1+B2 → B2) and target count.
Two consecutive good sessions (score ≥80%, not 吃力) promote; one 吃力/hard or <60% demotes. The
starting tier was calibrated to 2.5–3.5% on 2026-09-22 (trial: 5 targets, 3/3 correct, "偶尔吃力").

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
`$STATE/anki-words.json`.

---
name: english-context
description: "Use when generating SLA-grounded English reading passages (A2→B1 news style) with an exposure ledger, CEFR hard validation, and Anki 重逢词 recycling. 生成英语阅读材料/来一篇/reading practice/target word recycling."
version: 1.18.0
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
   `status`/`pool` also print `skillUpdate` (is the skill itself behind GitHub?) — see the
   self-update check section for what to do with each shape.
3. **Topic:** use the user's stated topic; otherwise pick the least-recently-used entry from
   `ledger.mjs status` interests (offer to add new interests from what they enjoy reading).
   Genre defaults to news style; honor requests for story/explanation/dialogue.
   **Anti-repeat (hard read-first):** compare against `pool`'s `recent` (last 5 non-void sessions).
   If the new topic/scene rhymes with a recent one, change the angle, setting or outcome — a
   different cast of the same story does not count. Learner-forced topics proceed, but the angle
   must still differ from `recent`.
4. **Targets:** `ledger.mjs pool --limit 12` returns `mustReuse`, `fresh`, and `recent`. Fill the
   quota — **4–5 words total
   at every tier**: **3–4 words from
   `mustReuse`** (in-progress words past their cooldown and not counted today — **graduation-priority:
   closest to 6/6 first, longest-unseen breaks ties** (v1.14.0, learner-approved: the queue must
   drain, 12 passages had produced 0 graduations); skip one only if the topic truly cannot host it) + **1–2 words from `fresh`**
   (never-used tier-level candidates; tightened from 2–3 — new words wait while near-graduation words
   are harvested). **Anti-repeat:** the chosen target set must not exactly equal
   any `recent` entry's targets (partial overlap is fine) — on an exact hit, redraw from `fresh`.
   On a binge day `mustReuse` empties out (everything counted today
   sleeps) — then fill the whole quota from `fresh`; never refuse to generate, and mention
   `inFlight`/`sleeping` when the learner is reading several passages in one day.
   Learner-specified words always win and count toward the quota, but are subject to the same-day lock.
   Reunion words: choose from Anki/graduated words that fit the topic naturally; skip the section
   honestly rather than force ungrammatical cameo sentences.
   **定档位 + 协商（起草前必做）：** 读 `pool`/`status` 的 `menu` —— 那是完整的多维多档选择面，
   每个轴列出**全部档位及其含义**，标了 `current: true` 的那一档就是**默认值**
   （= 学习者上次的选择；五轴存在 state.json 里，跨会话、跨机器自动保留，不需要另存）。
   把菜单念给学习者听（至少念各轴当前那一行），然后：
   - 他说「句法 3」「语篇松一点」「词池到 6」→ 你跑 `ledger.mjs axes --syntax 3 --cohesion 3 --tier 6` 落地
   - 他说「就按默认」→ 什么都不用改
   - 想确认自动反馈有没有偷偷改过他的选择：`pool` 的 `lastUsed` 是上一篇实际用的档位快照，
     **与 `menu` 的 current 不同就说明被体感反馈降过档** —— 照实告诉他，别让他以为自己选的值还在。
   **探针（同一处顺带判）：** 若 `history` 里**最近连续 3 篇** feel 全为 `ok`，说明一直待在无聊区、
   传感器没有信号 —— 本篇按轮转把一个轴顶到**最紧/最难档**（顺序：语篇 → 背景 → 句法 → 词汇 → 题型），
   同样先告诉学习者再动手，他不想就跳过。
   冲突规则：点菜不能突破硬闸（生词率 / 句长 / 小句 / 衔接上下限照旧）；
   若学习者要加负荷而句法档已被实际受挫推紧（`axes.句法` 高于常规），**以那个更紧的档为准**——愿望不覆盖受挫证据。
5. **Draft** the passage per [the format guide](references/passage-format.md), then validate silently:
   write the **complete finished material** — 正文 + 生词表 + 重逢词 + 理解题，与第 7 步展示的
   1:1（题目行以 `1. ` 编号；只存正文 = 归档残缺）— plus `meta.json`
   (`{"topic","targets":[],"reunion":[],"names":[]}` — names = proper nouns；**没有画像字段要填**)
   to temp files and run
   `node "$SKILL_DIR/scripts/passage-check.mjs" --passage <md> --meta <json> --state-dir $STATE --report <report.json> <gateFlags>`，
   其中 `<gateFlags>` **逐字复制** `pool`/`status` 输出的 `gateFlags` 字段（句长/小句/被动/衔接上下限全套），
   别自己拼、也别只在自己记得的时候传。
   On FAIL: revise and re-check (max 3 attempts) without showing the learner不合格品; on the 4th
   failure report the structural blocker honestly instead of shipping a bad passage. Keep the exact
   passage file — step 6 archives those bytes and the report's `passageSha256` pins them.
6. **Pending entry + archive:** after a PASS, ① `ledger.mjs pend --meta <json>` (note the returned
   session id; exposures are NOT counted yet); ② `ledger.mjs archive --session <id> --passage <md>
   --report <report.json> [--quiz "B,A,C"]` — the script writes `$STATE/passages/<id>.md` (frontmatter
   + validatedBy generated mechanically, archive refused if the bytes drifted from the validated ones)
   and pushes it (output carries `sync`); ③ done — nothing else to write or push by hand. Filenames
   are unique session ids → append-only, never conflicts in git.
7. **Show** the formatted passage in chat. If `status` shows pending sessions older than today, append
   one gentle line — never nag twice about the same one.
8. **Confirm → count:** when the learner finishes (answers quiz / says 读完了), collect the score plus
   a 体感 in one prompt — always present the six-level load scale so it is one tap to answer:
   「① 太简单(flow) ② 刚好(ok) ③ 生词太多(wordy) ④ 句子太难(dense) ⑤ 背景/话题陌生(context) ⑥ 接不上/读着跳(choppy)」(→ `flow` / `ok` /
   `wordy` / `dense` / `context` / `choppy`). Their own phrasing always wins over the scale. Then `ledger.mjs confirm --session <id>
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

## Skill self-update check (script-level)

`ledger.mjs status` and `pool` print a `skillUpdate` field, computed by `skill-update.mjs` on the
mandatory session-start path (throttled to one `git fetch` per 24h, stored in `$STATE/.local/`;
`EC_UPDATE_CHECK=0` disables). Soft-fail by design — a network hiccup must never block a reading
session. Interpret it every session:

| `skillUpdate` shows | meaning | agent action |
|---|---|---|
| `{upToDate:true, version}` | local skill = origin/main | nothing — step 6's signature is generated by `ledger.mjs archive` from the passage-check report, never from this cached field |
| `{behind:N, ruleLayer:true, ...}` | `scripts/ SKILL.md references/ assets/` changed upstream | **before drafting**: tell the learner validation rules may differ, ask whether to `git pull` this session; never auto-pull |
| `{behind:N, ruleLayer:false}` | docs/tests only | keep going, mention at session end |
| `{offline:true}` / `{check:'recent'}` | fetch failed / already checked within the throttle window | silently continue — a failed fetch retries after ~10 min, a successful one after 24h |

Throttling nuance (Win Hermes findings, v1.6.1/1.6.2): `pool` — the last checkpoint before drafting —
forces one real fetch whenever its stamp was not written during this command, so a push from the
other machine is invisible for at most one passage; `status` stays on the 24h throttle. The cache
stamp is keyed on local HEAD: after any `git pull` the first `status`/`pool` re-fetches, so a stale
"upToDate" can never survive a version change on this machine.

## Publishing skill changes (Mac = source of truth)

Standing rule (2026-09-23): on the Mac, **改完、测绿就自动推，不用每次问** — but the only publish path is
`node "$SKILL_DIR/scripts/ship.mjs" -m "message"`. It is fail-closed: acceptance suite must print
`fail=0` (skippable only via `--no-verify`, which is reserved for the suite's own ship tests),
origin must not have moved, and a diff-consistency version lint runs — rule-layer files changed
without a `version:` bump → REJECT; version bumped with no rule file → warn ("empty bump").
Never `git commit`/`git push` the skill repo by hand; hand-pushing is how the 1.4.2→1.5.0 silent
mismatch happened. Every successful ship auto-prepends an entry to `CHANGELOG.md`
(version + date + the `-m` text) — the changelog is script-owned, agents never edit it by hand. Windows Hermes consumes via the `skillUpdate` field above and only ships fixes
the learner explicitly asks for.

## Spacing rules (script-enforced)

| Rule | Value |
|---|---|
| Cooldown ladder | a word may return only after `1/6→1d, 2/6→1d, 3/6→2d, 4/6→3d, 5/6→4d` since its last exposure |
| Same-day lock | **max one exposure per word per calendar day** — a second same-day appearance is still read (and can be a reunion word) but does not increment |
| Consequence | graduation inherently spans ≥6 distinct days; binge reading fills with fresh words instead of massing the same ones |
| Reporting | `confirm` returns `lockedToday` for words that did not count; `pool`/`status` return `inFlight` (words 1–5/6) and `pool` also `sleeping` (in cooldown or counted today) |

## Hard rules (script-enforced; see passage-check.mjs)

- 250–350 words。句长 / 小句 / 被动 / 衔接的上下限**全部由五轴档位推出**，`pool`/`status` 会输出一串
  现成的 `gateFlags` —— 起草后**逐字复制**它去跑 passage-check，别自己拼。
- 4–5 targets, each appearing ≥2× in prose, each bolded at least once.
- Above-level token rate ≤4% (targets only; reunion/whitelist/known words cost no coverage).
- Zero undeclared above-level words: anything above CEFR A2 must be a declared target, reunion word,
  whitelist entry (`assets/allow-extra.txt`), or known word. Numbers/numerals and irregular forms
  are handled; anything else fails.

## Dynamic difficulty（v1.16.0：五轴）

体感 is a **load-type diagnosis**, and each answer pulls only its own lever:

| 体感 / 成绩 | 词汇 tier(1–8) | 句法 syntax(0–4) | 语篇 cohesion(0–3) | 背景 background(0–2) |
|---|---|---|---|---|
| flow ① + 正确率 ≥80% | `streakGood++`，**连续 2 次**才 +1 | 不变 | 不变 | 不变 |
| ok ②（甜区，i+1） | 保持；连击清零 | −1（**止于常规 1**） | 不变 | 不变 |
| wordy ③（生词太多） | 立即 −1（下限 1） | −1（止于常规 1） | 不变 | 不变 |
| dense ④（句子太难） | 不变 | **至少跳到 3**（16/10），已在 3 以上再紧一档，封顶 4 | 不变 | 不变 |
| context ⑤（背景陌生） | 保持 | −1 | 不变 | **−1**（v1.16.0 起它终于是可调档） |
| choppy ⑥（接不上/读着跳） | 保持 | −1 | **−1** | 不变 |
| 正确率 <60% | −1 | **至少跳到 3**（同上） | 不变 | 不变 |

> **台账记的是「档位 → 体感」（v1.17.0）**：每篇 `pend` 时把当时的五轴档位快照进 session，
> `pool` 的 `history` 字段输出最近 8 条的 `{axes, feel, score}` 对账，archive 时同一份档位写进 frontmatter。
> 这就是校准的全部依据：**某个轴向调紧之后体感变了没有**。
> 四维 `predicted`/`requested` 画像已在 v1.17.0 **退役**——它记的是 AI 对自己的猜测，下游没人消费，
> 且四格里三格与脚本直接测到的值重复（tier 决定用词、句法有硬指标、衔接有重叠/连接词）。
> 旧台账里遗留的 predicted/requested 行是惰性历史，不影响任何逻辑。

只有「① 太简单」说明这一档的词袋已被吃透（i+0），才允许上调；「② 刚好」是我们追求的平衡点，停在原地。
**语篇档与题型档没有自动漂移**——只由体感、点菜、探针驱动。不发明没校准过的动力学。

### 五轴各是什么

| 轴 | 档位 | 谁在动它 | 依据 |
|---|---|---|---|
| **词汇** tier | 1–8 | wordy / flow×2 | 复合稀有度 = 词频 + AoA + 具体性（见 `assets/word-bands.tsv` 头部）。档越高允许出现的难词越多 |
| **句法** syntax | 0–4 | dense / 低分 / ok 松档 / 点菜 | 一个「句法包」：句长 + **每句小句数** + 全篇被动数。0 放宽（24/14）· 1 常规（20/12，默认）· 2 偏静（18/11）· 3 冷静（16/10）· 4 最静（13/8） |
| **语篇** cohesion | 0–3 | choppy / 点菜 / 探针 | **双向**：易端强制显性衔接（0 紧扣 ≥0.07 重叠 / ≥0.48 连接词），难端主动少用衔接（3 松 ≤0.03 / ≤0.30）让读者自己补关系 |
| **背景** background | 0–2 | context / 点菜 | 兴趣内话题 · 通识话题 · 新领域话题。**不由脚本测量**（需要读者模型），靠选题兑现 |
| **题型** quiz | 0–2 | 点菜 / 探针 | 以事实检索为主 · 各半 · 以推断为主。同样只申报不强检 |

**改档位**：`ledger.mjs axes --tier 5 --syntax 2 --cohesion 3`（任一轴，可只给一部分）。
**为什么句长不再是唯一**：实测 13 篇存量档平均句长 8.8 词而上限 12，句长轴几乎是饱和的；
真正的难度差藏在**小句密度**（实测最多 2–3 小句/句）和**衔接**（重叠 0.006–0.133，差 20 倍）里。
目标词数八档统一固定 **4–5**（v1.8.0 起，难度靠词池与词级，不靠加数量）。

**迁移**：`state.version < 2` 走 v1.14.0 三档 → 六档；`< 3` 走六档 → 八档（旧 3 = B1 全量 2178 词 ≡ 新 4）
并把手动计的 `syntaxCalm` 转成新档位索引（+1），串联执行，见 `load()`。
起始参数由 2026-09-22 试炼校准（5 词、2.5–3.5%、3/3、"偶尔吃力"）。

## Files

```text
SKILL.md
CHANGELOG.md                      更新日志：ship.mjs 每次成功发布自动追加，勿手改
BOOTSTRAP.md                      新机器/新 agent 的一句话记忆：发布只走 ship.mjs
references/passage-format.md      输出模板 + 格式级规则（注释/题目/重逢词写法）
scripts/passage-check.mjs         硬校验（词表/句长/复现/生词率），exit 0/1 + JSON 报告
scripts/ledger.mjs                init|status|pend|archive|confirm|void|graduate|import-anki|pool|axes|interest
scripts/sync-anki-words.mjs       只读拉取 Anki 已学词（Agent Connect 8766）
scripts/state-git.mjs             台账跨机同步：pull(会话开始)/push(会话结束)，分叉时停下问人
scripts/skill-update.mjs          会话必过路径上的 skill 落后检查（24h 节流、软失败、只读）
scripts/ship.mjs                  唯一发布路径：绿测试 + 版本联动 lint + 远端移动守卫，fail-closed
scripts/lib-layers.mjs            rule 层定义（scripts/SKILL.md/references/assets），lint 与 check 共用
assets/cefr-j-words.tsv           CEFR-J/Octanove 词表（拷贝自 anki-flashcard，独立演化）
assets/word-bands.tsv             B1/B2 的复合稀有度四段（词频 + AoA + 具体性，非商业研究数据）——8 档词池的过滤依据
assets/allow-extra.txt            白名单（已知专业词：sensors 等）
assets/irregular-forms.txt        不规则变化不算超纲
tests/acceptance.sh               验收套件
```

State (survives skill reinstall): `$STATE/state.json`, `$STATE/known-words.txt`,
`$STATE/anki-words.json`, `$STATE/passages/<session-id>.md`（展示过的每篇正文档案：pend 时写入、
void 时删除；append-only 唯一文件名，git 永不冲突，随 ledger 写操作的自动推送跨机同步）。
`$STATE/.local/` holds the `skillUpdate` throttle stamp — gitignored, never synced.

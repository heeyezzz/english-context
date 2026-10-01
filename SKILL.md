---
name: english-context
description: "Use when generating SLA-grounded English reading passages (A2→B1 news style) with an exposure ledger, CEFR hard validation, and Anki 重逢词 recycling. 生成英语阅读材料/来一篇/reading practice/target word recycling."
version: 1.40.0
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
   `pool` also prints `skillUpdate` (is the skill itself behind GitHub?) — see the
   self-update check section for what to do with each shape.
3. **Topic:** use the user's stated topic; otherwise pick the least-recently-used entry from
   `ledger.mjs pool` interests (offer to add new interests from what they enjoy reading).
   Genre defaults to news style; honor requests for story/explanation/dialogue.
   **Anti-repeat (hard read-first):** compare against `pool`'s `recent` (last 5 non-void sessions).
   If the new topic/scene rhymes with a recent one, change the angle, setting or outcome — a
   different cast of the same story does not count. Learner-forced topics proceed, but the angle
   must still differ from `recent`.
4. **Targets:** `ledger.mjs pool --limit 12` returns `mustReuse`, `fresh`, and `recent`. Fill the
   quota — **read `quota` from pool, don't hardcode it**: normally `{mustReuse:[3,4], fresh:[1,2]}`
   (total **4–5 at every tier**); once the queue saturates, pool returns
   `{mustReuse:[4,5], fresh:[0,0]}` and you take **no new words at all**.
   `mustReuse` words are **graduation-priority: closest to graduation (5/5) first, longest-unseen breaks ties**
   (v1.14.0, learner-approved: the queue must drain); skip one only if the topic truly cannot host it,
   but keep at least 1 in the passage. `fresh` words are never-used tier-level candidates.
   **Binge reading no longer empties `mustReuse`** — since v1.31.0 the gap is in hours, so a word can
   come back the same day. If `mustReuse` genuinely runs short, fill from `fresh`; never refuse to
   generate, and mention `inFlight`/`sleeping`/`saturated` when several passages run in one day.
   **Anti-repeat:** the chosen target set must not exactly equal any `recent` entry's targets
   (partial overlap is fine) — on an exact hit, redraw from `fresh`.
   Learner-specified words always win and count toward the quota, and are subject to the hour gap.
   Reunion words: choose from Anki/graduated words that fit the topic naturally; skip the section
   honestly rather than force ungrammatical cameo sentences.
   **定档位 + 协商（起草前必做）：** 读 `pool` 的 `menu`（四轴全部档位 + `direction` + `set`
   + 逐轴 `lastUsed` / `driftedSinceLastDraft`）与 `fixedLimits`（不可调的固定红线），
   然后**照 [面板模板](references/panel-templates.md) 念** —— 单版模板：四张完整档位表（名称 + 数值 + 难度说明）+「固定配置参数」五项；挑档方式（报「项目+数字」）由 agent 口头带一句，不写进面板。
   **别临时组织格式**：每个 agent 念得不一样，学习者就无法形成稳定预期。**面板直接输出 markdown，别套代码块**（套了就退化成一排裸管道符）。
   填槽值一律从 `pool` 取，一个都不许自己编；`gateFlags` 只给 passage-check，不念给他听。然后：
   - 他回「句子 3」「衔接松一点」「词池到 6」→ 你跑 `ledger.mjs axes --syntax 3 --cohesion 3 --tier 6` 落地，**只回一句「好，句子调到 3（常规）」——命令不出现、也不念出来**（档名一律从 `pool` 取，此处仅示例）
   - 他说「就按默认」→ 什么都不用改
   - 漂移（`driftedSinceLastDraft`）只说明**他改过档、但还没在任何成篇里用过**
     （v1.22.0 起体感不再调档，所以漂移**不可能**是自动发生的）—— 照实说，别让他以为已经生效过。
   冲突规则：点菜不能突破硬闸（生词率 / 句长 / 小句 / 衔接上下限照旧）。
   **难度变动 100% 由学习者决定（v1.19.0；v1.22.0 删净余下的自动路由）：** agent **不顶档、不调档、不猜**。
   报 `ok` 就是「到了目标」——按 skill 自己的理论（v1.3.0），甜区就是终点。体感与成绩只记录，不改任何参数。
   想升想降时，**把菜单再念一遍**，让他自己挑轴挑档（`axes` 是唯一的入口）。
   起草前另外把 `pool` 的 `history` 念给他看：这是「他上次设的档位 → 实际体感」的账，供**他**判断下一步。
5. **Draft** the passage per [the format guide](references/passage-format.md), then validate silently:
   write the **complete finished material** — 正文 + 生词表 + 重逢词 + 理解题，与第 7 步展示的
   1:1（题目行以 `1. ` 编号；只存正文 = 归档残缺）— plus `meta.json`
   (`{"topic","targets":[],"reunion":[],"names":[]}` — names = proper nouns；**没有画像字段要填**)
   to temp files and run
   `node "$SKILL_DIR/scripts/passage-check.mjs" --passage <md> --meta <json> --state-dir $STATE --report <report.json> <gateFlags>`，
   其中 `<gateFlags>` **逐字复制** `pool` 输出的 `gateFlags` 字段（句长/小句/被动/衔接上下限全套），
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
7. **Show** the formatted passage in chat. If `pool` shows pending sessions older than today, append
   one gentle line — never nag twice about the same one.
8. **Confirm → count:** when the learner finishes (answers quiz / says 读完了), collect the score plus
   a 体感 in one prompt — always present the six-level load scale so it is one tap to answer:
   「① 太简单(flow) ② 刚好(ok) ③ 生词太多(wordy) ④ 句子太难(dense) ⑤ 背景/话题陌生(context) ⑥ 接不上/读着跳(choppy)」(→ `flow` / `ok` /
   `wordy` / `dense` / `context` / `choppy`). Their own phrasing always wins over the scale.
   **v1.22.0：成绩与体感都只是记录**——没有任何一条 feel 会改动档位，所以问的时候别暗示「选了就会自动调」。
   Then `ledger.mjs confirm --session <id>
   --score a/b --feel ...` (feel absent and unanswered once → ask once more; still absent → omit the
   flag, never guess). This is the ONLY moment exposure counts. "重写/换主题" → `ledger.mjs void
   --session <id>`; zero accounting, and void also deletes the archived `$STATE/passages/<id>.md`
   (reports `passageRemoved`; the deletion rides the auto-push) — a voided passage leaves no corpse.
9. **Graduation:** `confirm` nominates any target at ≥5 exposures (v1.40.0: the 5th exposure graduates — no sixth). Present nominations as
   「候选毕业：word (5/5) → 同意？」. On yes: `ledger.mjs graduate --word w`, then ALWAYS offer the
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

`pool` prints a `skillUpdate` field, computed by `skill-update.mjs` on the
mandatory session-start path (throttled to one `git fetch` per 24h, stored in `$STATE/.local/`;
`EC_UPDATE_CHECK=0` disables). Soft-fail by design — a network hiccup must never block a reading
session. Interpret it every session:

| `skillUpdate` shows | meaning | agent action |
|---|---|---|
| `{upToDate:true, version}` | local skill = origin/main | nothing — step 6's signature is generated by `ledger.mjs archive` from the passage-check report, never from this cached field |
| `{behind:N, ruleLayer:true, ...}` | `scripts/ SKILL.md references/ assets/` changed upstream | **before drafting**: tell the learner validation rules may differ, ask whether to `git pull` this session; never auto-pull |
| `{behind:N, ruleLayer:false}` | docs/tests only | keep going, mention at session end |
| `{offline:true}` / `{check:'recent'}` | fetch failed / already checked within the throttle window | silently continue — a failed fetch retries after ~10 min, a successful one after 24h |

**v1.23.0: throttled only.** `pool` used to force a real fetch on every call (so a push from the
other machine was invisible for at most one passage). That put an 8s-timeout network request on the
drafting path, for a benefit a daily reading routine does not need — so the forced fetch is gone and
the check is 24h-throttled like everything else. Consequence, stated honestly: a push from the other
machine can now be invisible for up to 24h, so **pull before generating on a machine you have not
used today** (step 2 already does this). The cache stamp stays keyed on local HEAD, so after any
`git pull` the next `skillUpdate` re-fetches — a stale "upToDate" still cannot survive a version
change on this machine.

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
| Cooldown ladder | a word may return only after `1/5→1h, 2/5→3h, 3/5→6h, 4/5→12h, 5/5→24h` since its last exposure (v1.40.0 learner-shrunk; the 5/5 rung only applies to a learner-specified word that runs past graduation) |
| Same-day lock | **retired in v1.31.0** — any sub-24h gap is inert while "one exposure per calendar day" stands, so the two rules were merged into the hour ladder above. A word may now count twice in one day once its gap has elapsed |
| Consequence | shortest first-to-fifth span is **22h** (1+3+6+12h) — graduation is 5 exposures, no sixth (v1.40.0; was 6 exposures / 3.5 days) |
| Reporting | `confirm` returns `tooSoon` (with hours remaining) for words that did not count; `pool` returns `inFlight`, `sleeping`, and `saturated` |
| Clock granularity | **every clock is hour-granular, not date-granular**: per-word exposures (`words[].last`) *and* the reading log (`session.at` = generated, `session.readAt` = finished reading). A date-only log could not explain an hour-based gap. The archive is written at `pend`, so its frontmatter carries `at` only — the read time stays in the ledger, keyed by session id |
| Saturation valve | when `inFlight > 25`, `pool` emits `saturated: true` and `quota: {mustReuse:[4,5], fresh:[0,0]}` — **stop taking new words so the queue can drain**. Deferred by the learner in v1.13.0, switched on in v1.31.0 when the backlog data arrived (35 in flight, 0 exits) |
| Legacy values | old `last` values are bare dates; they are read as that day 00:00 local, so the first run after upgrading cools every word slightly earlier than the day-based rule did |

## Hard rules (script-enforced; see passage-check.mjs)

- 250–350 words。句长 / 小句 / 被动 / 衔接的上下限**全部由四轴档位推出**，`pool` 会输出一串
  现成的 `gateFlags` —— 起草后**逐字复制**它去跑 passage-check，别自己拼。
- 4–5 targets, each appearing ≥2× in prose, each bolded at least once.
- Above-level token rate ≤4% (targets only; reunion/whitelist/known words cost no coverage).
- Zero undeclared above-level words: anything above CEFR A2 must be a declared target, reunion word,
  whitelist entry (`assets/allow-extra.txt`), or known word. Numbers/numerals and irregular forms
  are handled; anything else fails.

## Difficulty（v1.22.0：四轴，**无自动路由**）

**这个 skill 不判断难度。** 它的职责是「按你设定的档位，生成符合 i+1 契约的材料，并如实记录发生了什么」；
档位往上还是往下，**全部由学习者通过 `axes` 明确指定**——这是唯一会改动难度轴的入口。

体感与成绩是**纯记录**，不是控制信号：没有任何一条 feel 会动参数。

> 为什么把整个体感路由（安全阀）删掉（v1.22.0）：
> - 每一条都与学习者自己锁定的规则冲突或静默覆盖它。最清楚的是 `ok`（甜区 = 保持不变）却去松句子档：
>   实测手动设 `--syntax 4`，四篇 ok 就把它一路松回常规 1，再一次 dense 又推回 3——一个走不出的循环。
>   （这三处数字是 v1.36.0 索引翻转**前**的档位，翻转为历史记录，不按新序改写。）
> - 它在全部 20 篇里**一次都没触发过**：体感 16 次全是 `ok`，没有一篇 counted 低于 60%。
> - 它和 `axes` 功能重复——四根轴本来就能直接点。
> `streakGood` 随它一起删除（它只为「连续两次 flow 升档」而存在）。

> **台账记的是「档位 → 体感」**：每篇 `pend` 时把当时的四轴档位快照进 session，
> `pool` 的 `history` 输出最近 8 条的 `{axes, feel, score}`，archive 时同一份档位写进 frontmatter。
> 这是**给学习者自己看的账**：某轴调紧后仍报 ok 说明还有余量，一调紧就抱怨说明边界在上一档。
> agent 的职责是把这个读给他听，让他决定下一步——不是替他决定。
> （四维 `predicted`/`requested` 画像在 v1.17.0 退役，探针在 v1.19.0 删除，原因同类：记的是 AI 的判断或猜测，下游没人消费。）

### 四轴各是什么

| 轴 | 档位 | 怎么改 | 依据 |
|---|---|---|---|
| **词汇** tier | 1–8 | 只能 `--tier` | 复合稀有度 = 词频 + AoA + 具体性（见 `assets/word-bands.tsv` 头部）。档越高允许出现的难词越多 |
| **句子** syntax | 0–4 | 只能 `--syntax` | 一个「句子包」：句长 + **每句小句数** + 全篇被动数。**v1.36.0 起索引翻转，四轴同向（越大越难）**：0 最静（13/8）· 1 冷静（16/10）· 2 偏静（18/11）· 3 常规（20/12，默认）· 4 放宽（24/14） |
| **衔接** cohesion | 0–3 | 只能 `--cohesion` | **双向**：易端强制显性衔接（0 紧扣 ≥0.07 重叠 / ≥0.48 连接词），难端主动少用衔接（3 松 ≤0.03 / ≤0.30）让读者自己补关系 |
| **话题** background | 0–2 | 只能 `--background` | 兴趣内话题 · 通识话题 · 新领域话题。**不由脚本测量**（需要读者模型），靠选题兑现 |

**改档位**：`ledger.mjs axes --tier 5 --syntax 2 --cohesion 3`（任一轴，可只给一部分）。
起草前把 `pool` 的 `menu` 念给学习者——那是完整的多维多档选择面，`current` 就是默认（= 他上次的选择）。
**为什么句长不再是唯一**：实测 13 篇存量档平均句长 8.8 词而上限 12，句长轴几乎是饱和的；
真正的难度差藏在**小句密度**（实测最多 2–3 小句/句）和**衔接**（重叠 0.006–0.133，差 20 倍）里。
目标词数八档统一固定 **4–5**（v1.8.0 起，难度靠词池与词级，不靠加数量）。

**迁移**：`state.version < 2` 走 v1.14.0 三档 → 六档；`< 3` 走六档 → 八档（旧 3 = B1 全量 2178 词 ≡ 新 4）
并把手动计的 `syntaxCalm` 转成当时的档位索引（+1）；`< 4` 走 v1.36.0 的**句子档索引翻转**（新 = 4 − 旧，
难度包一字未动，只反写编号），当前档位和每篇的档位快照一起翻——快照不翻的话 `history` 会把旧档读成反方向。
串联执行，见 `load()`。已归档的 `passages/*.md` frontmatter **不回改**（那是当时的成品记录，无脚本回读）。
跨机注意：另一台机器若还装着 v1.35.0 及更早的 skill，会用旧编号解释迁移后的值（旧 3 = 冷静，新 3 = 常规），
所以**先在那台更新 skill 再生成**（`pool` 的 `skillUpdate.ruleLayer` 会提示）。
起始参数由 2026-09-22 试炼校准（5 词、2.5–3.5%、3/3、"偶尔吃力"）。

## Files

```text
SKILL.md
CHANGELOG.md                      更新日志：ship.mjs 每次成功发布自动追加，勿手改
references/passage-format.md      短文输出模板 + 格式级规则（注释/题目/重逢词写法）
references/panel-templates.md     生成前难度面板的固定模板（单版：四张档位表〔名称+数值+难度说明〕+「固定配置参数」五项；（现在）与漂移行按 pool 动态处理）
scripts/passage-check.mjs         硬校验（词表/句长/复现/生词率），exit 0/1 + JSON 报告
scripts/ledger.mjs                init|pend|archive|confirm|void|graduate|import-anki|pool|axes|interest
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

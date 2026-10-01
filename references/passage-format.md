# Passage format (模板级规则 ③)

The learner sees ONE markdown block in chat. There is no output file. Structure:

```markdown
# <English title, A2-simple>

<250–350 words, news style: short paragraphs, facts, one quoted line.
Every target word appears ≥2 times; first appearance inside **bold**.
Reunion words appear plain (no bold, no annotation) at least once each.>

### 目标词 · 只给语境义
| 词 | 在这篇里 |
|---|---|
| **service** | n. 公共交通系统（不是泛指的「服务」）|

### 重逢词（Anki 旧词，本篇各见 N 面）
- **schedule** — updates the *schedule*「更新时刻表」

### 理解题（默认 3 道，选择题，可 --no-quiz 关闭）
1. Why was the train late? — A. rain  B. a broken train  C. too many passengers
```

Rules that are format, not script-checked:

- 生词注释只给「词性 + 本篇语境义」一行，不整句翻译，不给词典全义（注意假说：焦点是「这个词在这里是什么意思」）。
- 理解题考大意不考词义记忆，题目本身也必须是 A2 用词；正确答案位置随机。
- 重逢词在正文里必须语法自然——一个都塞不进就少声明几个，禁止为复现造怪句。
- 文末可加一行 metrics（词数/生词率/句长），来自 passage-check 输出。

Script-checked rules (硬校验，见 passage-check.mjs)：篇长、句长与小句/被动/衔接上下限（由 gateFlags 给出）、
目标词 4–5 个各≥2 次、纲外 token 率≤4%、未申报纲外词=0、**每个目标词至少加粗一次**、
声明的重逢词至少出现一次。以上全部为硬闸，任一不满足即 FAIL（v1.20.0 起，加粗与重逢词从 warn 提为硬闸）。

## 起草时的判定细节（读脚本 + 实测得到；每条都对应过一次返工）

- **只有 `.` `?` `!` 切句，逗号与冒号不切**：`A, and B.` 算**一句**。所以句长上限 13 的档位，
  安全写作线是 11 词——`and` 连接的复合句最容易超限。
- **引语会和引导句合并成一句**：`They met again a week later, and one farmer said, "The town is leaving us out."`
  实测被切成 16 词一句（真实 FAIL 案例）。要么把引导句独立成短句，要么让引语自己成句。
- **篇长数的是整个成品文件**：`#` 开头行与 `|` 表格行被剔除，但**重逢词例句行与理解题行既算句子、也进 250–350**。
  正文写 220 词左右 + 附录 ≈ 320，正好落在区间；正文奔着 300 写就会溢出，还会把平均句长抬高。
- **两词重逢短语不可用**：判定按单词走，`comply with` / `packing list` 里的 `comply`、`packing`
  会被判成未申报超纲词。重逢词只挑单词。
- **假被动也计入被动数**：规则是 `be + (以 -ed/-en 结尾 | 不规则过去分词)`，因此
  `are gone`、`is often`、`is open` 这类语义上不是被动的写法一样触发（`gone` 在不规则表里）。
  零被动档位要避开 be 后接这类词。
- **比较级不做词形还原**：`easier` 还原只会得到 `eas`/`easie`，查不到 `easy` → 判为纲外；
  `better` 因为在词表里所以安全。比较级逐个自查，别按原形推断。
- **超长句直接给原文**：报告字段 `longestSentences` 列出最长的三句及其词数与原文，
  FAIL 后照它改，不必再写反查脚本。

### 词级预查（起草前挡掉纲外词；复用同一个 classify，不新增代码路径）

把候选词一次性写进一个探针文件，用宽松闸门跑一遍，只读 `undeclared`：

```bash
printf 'One day main prize tools papers got met easier better.\n' > /tmp/probe.md
printf '{"topic":"probe","targets":[],"reunion":[],"names":[]}\n' > /tmp/probe.json
node "$SKILL_DIR/scripts/passage-check.mjs" --passage /tmp/probe.md --meta /tmp/probe.json \
  --state-dir $STATE --min-words 1 --max-words 9999 --max-rate 100 --max-sentence 99 \
  --avg-sentence 99 --max-clauses 99 --min-connectives 0 --min-targets 0
# → undeclared: [ 'main (B1, x1)', 'prize (B1, x1)', 'easier (OFF, x1)' ]（其余放行）
```

`OFF` = 连词表都查不到，`B1/B2` = 有级别但超过当前档位。这套宽松参数是验收套件自己在用的调用形态
（tests/acceptance.sh 的 knownforms 用例），不是旁路工具。

## 存档文件（$STATE/passages/<session-id>.md）

展示即归档：**frontmatter 现由 `ledger.mjs archive` 机器写入**（第 6 步），本节描述的是产物
形态，不再是 agent 的手写规范。archive 用 passage-check 报告的 `passageSha256` 锚定字节：
送检后文本再被改动会直接拒绝归档；void 会删除该文件。

```markdown
---
session: 2026-09-23-coffee-2
date: 2026-09-23
topic: 咖啡
targets: [aroma, bitter, steep, strain, blend]
reunion: [schedule, volunteer]
metrics: { words: 288, aboveLevelRate: 3.1%, maxSentence: 15, avgSentence: 10.4 }
quizAnswers: [B, A, C]
validatedBy: 1.6.1 (sha256:ab12cd34)   # 由 archive 从 passage-check 报告程序化复制
---

（正文、生词表、重逢词、题目——与展示内容 1:1，题目可含选项但答案只写在 frontmatter。
第 5 步送检与第 6 步 `archive --passage` 用的就是这个完整成品文件——只存正文 = 归档残缺）
```

价值：重读旧篇、`grep -l strain passages/` 查一个词的全部历史语境、
毕业时给 Anki 桥挑最佳例句。

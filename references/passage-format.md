# Passage format (模板级规则 ③)

The learner sees ONE markdown block in chat. There is no output file. Structure:

```markdown
# <English title, A2-simple>

<整篇字数按篇长档（默认标准档 = 250–350），news style: short paragraphs, facts, one quoted line.
Every target word appears ≥2 times; first appearance inside **bold**.
Reunion words appear plain (no bold, no annotation) at least once each.
正文带语块切分（v1.56.0）：[[The ad|那则广告]] [[sold|卖]] [[a small step counter|一个小巧的计步器]].>

### 目标词 · 只给语境义
| 词 | 在这篇里 |
|---|---|
| **service** | n. 公共交通系统（不是泛指的「服务」）|

### 重逢词（Anki 旧词，本篇各见 N 面）
- **schedule** — updates the *schedule*「更新时刻表」

### 理解题（默认 3 道，选择题，可 --no-quiz 关闭）
1. Why was the train late? — A. rain  B. a broken train  C. too many passengers

### 中文参考翻译（逐句对照，v1.57.0）
| 段.句 | 译文 |
|---|---|
| 1.1 | 小镇市政厅下有一间旧屋子。 |
| 1.2 | 多年来，那是一间储藏室…… |
```

Rules that are format, not script-checked:

- 生词注释只给「词性 + 本篇语境义」一行，不整句翻译，不给词典全义（注意假说：焦点是「这个词在这里是什么意思」）。
- **中文参考翻译（v1.49.0 起；v1.55.0 重写质量标准；v1.57.0 起改逐句）**：`| 段.句 | 译文 |` 表格——`|` 开头行
  被校验器剔除，**不进篇长/句长/衔接任何指标**，加它不会把篇长档撑爆。一行对正文一个英文句，
  **切句口径与校验器一致**：只有 `.` `?` `!` 断句，逗号冒号不切，句末标点后面的引号算在同一句里
  （`…phone on?" The next answer…` 是两句）。硬门三条：行数=正文句数、每段编号从 1 连续、每行必须有中文。
  旧形态 `| 段 | 译文 |` 仍放行（15 篇已归档文章不回填，站点按"有什么渲染什么"回落到整段展开）。
  标准是**信息忠实、句法自由**：不增译不缩译，一格只装一句（把两句并成一行就断了 1:1），
  但**一格内部允许中文自然断句**（该用句号就用句号，别为对齐英文硬撑成一个长句）。
  英文搭配禁止逐词对译成中文（源文本就是过了 i+1 硬闸的简化英语，再复印语序就是翻译腔的平方）。
  **每句译完盖住英文只读中文**，不像中文的句子重写一遍再交。
  对照例（2026-10-10 学习者实拍点名的坏译文）：
  ✗ 科学开始数生命……一项 2019 年的研究跟了 17,000 名美国女性……那份好处并没有永远持续
  ✓ 科学开始拿寿命来验这件事……2019 年一项研究追踪了 17,000 名美国女性。多走确实救过命，
    但好处并不一直成立——大约 7,500 步之后，再多走帮助不大
  它是读后核对用的参考答案：自由到对不上原句同样不合格，数字、专名、因果必须逐点对得上。
- **逐句对照的展示形状（v1.57.0，与站点契约）**：成品页把每句包成
  `<span class="s" data-zh="该句译文">英文原句</span>`——**中文只进 `data-zh` 属性，绝不进正文文字**
  （朗读取词走 textContent，「译」字教训；校验器数的是 md 正文，`|` 行与属性都不进指标）。
  句 span 包住该句内的语块与目标词 span，**不许与 `.ck` 交叉嵌套**：一个语块跨句 = 语块切分违规。
  站点在段级「译」按钮上开合（点本段 → 该段每句的译文以小字灰蓝**随文跟在句尾**，英文保持连续；再点收回），默认不显示。
  译文不许严格吊在句子正下方：一句折成两三行时它的"下方"正是下一句的"上方"，390px 上必然叠字，
  学习者拍板取"英文连续优先"。这条只约束展示层，交付格式不变。
- 理解题考大意不考词义记忆，题目本身也必须是 A2 用词；正确答案位置随机。
- **语块切分（v1.56.0）**：正文用 `[[英文块|中文短译]]` 切块。**长句（≥8 词）必切成 ≥2 块，短句可不切**
  ——逼着切简单句只会制造噪音。块是 2–7 词的意义单位（搭配、框架、修饰组、动宾组），
  不许把 `**加粗**`、数字（`17,000`）、专名（`manpo-kei`）拦腰切开；短译 3–8 字，只写该块**在本篇里的意思**。
  校验器只查结构（配对 / 带注释 / 不切加粗），切得好不好由学习者实读校准。**对指标不可见**：
  块内英文照常计词数句长，`[[ ]]` 与中文注释剥掉。阅读站把它渲染成「语块」开关（默认关，点开可逐块查释义）。
- 重逢词在正文里必须语法自然——一个都塞不进就少声明几个，禁止为复现造怪句。
- 文末可加一行 metrics（词数/生词率/句长），来自 passage-check 输出。

Script-checked rules (硬校验，见 passage-check.mjs)：篇长与目标词个数（由篇长档定，gateFlags 给出）、句长与小句/被动/衔接上下限（由 gateFlags 给出）、
目标词各≥2 次、纲外 token 率≤4%、未申报纲外词=0、**每个目标词至少加粗一次**、
声明的重逢词至少出现一次。以上全部为硬闸，任一不满足即 FAIL（v1.20.0 起，加粗与重逢词从 warn 提为硬闸）。

## 起草时的判定细节（读脚本 + 实测得到；每条都对应过一次返工）

- **只有 `.` `?` `!` 切句，逗号与冒号不切**：`A, and B.` 算**一句**。所以句长上限 13 的档位，
  安全写作线是 11 词——`and` 连接的复合句最容易超限。
- **引语会和引导句合并成一句**：`They met again a week later, and one farmer said, "The town is leaving us out."`
  实测被切成 16 词一句（真实 FAIL 案例）。要么把引导句独立成短句，要么让引语自己成句。
- **两套口径（v1.52.0）**：`#` 开头行与 `|` 表格行永远剔除。**篇长数整个成品文件**，区间由篇长轴定
  （v1.53.0；默认标准档 250–350：重逢词例句行、理解题行都算进字数，正文写 220 词左右 + 附录 ≈ 320
  正好落区间；其余档按 F 表等比挪）。但**难度闸**
  （句长、平均句长、小句数、被动、邻句重叠、连接词密度）**只读正文**，正文止于第一个 `##`/`###`
  附录标题。因为理解题题干不是可理解输入：`"…? — A. … B. … C. …"` 里 `Who … that …` 会被数成
  3 小句，syntax-1 档上限才 2，曾把一篇正文全清的稿件连着误杀 4 次。重逢词例句本就是正文句的复述，
  剔除它只会让重叠率/连接词更贴近真实正文（实测更高，不再被选项行稀释）。
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

把候选词一次性写进一个探针文件，用宽松闸门跑一遍，只读 `undeclared`。
临时文件**必须放进本次运行独有的目录**（`T=$(mktemp -d)`）——固定文件名是别的会话可能留下的旧文件，
"未读过不能覆盖"会直接把写入挡掉，于是无人值守任务卡在第 0 步：

```bash
T=$(mktemp -d)
printf 'One day main prize tools papers got met easier better.\n' > "$T/probe.md"
printf '{"topic":"probe","targets":[],"reunion":[],"names":[]}\n' > "$T/probe.json"
node "$SKILL_DIR/scripts/passage-check.mjs" --passage "$T/probe.md" --meta "$T/probe.json" \
  --state-dir $STATE --min-words 1 --max-words 9999 --max-rate 100 --max-sentence 99 \
  --avg-sentence 99 --max-clauses 99 --min-connectives 0 --min-targets 0
# → undeclared: [ 'main (B1, x1)', 'prize (B1, x1)', 'easier (OFF, x1)' ]（其余放行）
```

`OFF` = 连词表都查不到，`B1/B2` = 有级别但超过当前档位。这套宽松参数是验收套件自己在用的调用形态
（tests/acceptance.sh 的 knownforms 用例），不是旁路工具。

> **探针的 `pass:true` 不是发布依据，一个字段都不是。** 上面这串参数是把句长、篇长、生词率、
> 小句、被动、衔接、目标词数**全部关到不限制**换来的——它唯一回答的问题是"这些词纲内还是纲外"。
> 一篇通过预查的草稿离硬闸 FAIL 可以差得很远。成品校验只有一次机会：第 5 步用**完整成品文件**
> + 逐字复制的 `gateFlags` 跑那一遍，那才是判定。看到探针 pass 就往下走 = 发布未校验品。

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

（正文、生词表、重逢词、题目、参考翻译——与展示内容 1:1，题目可含选项但答案只写在 frontmatter。
第 5 步送检与第 6 步 `archive --passage` 用的就是这个完整成品文件——只存正文 = 归档残缺）
```

价值：重读旧篇、`grep -l strain passages/` 查一个词的全部历史语境、
毕业时给 Anki 桥挑最佳例句。

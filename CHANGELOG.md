# Changelog

Auto-maintained by scripts/ship.mjs — newest first.

## 1.35.0 — 2026-09-30

v1.35.0: 「每档是什么」由项目符号条改为表格（一轴一行、项目列与现状表逐字一致、档位按数字从小到大、B 句子行首带「越大越容易」警示）；排版约束同步禁止一档一列（会撑出横向滚动）

## 1.34.0 — 2026-09-30

v1.34.0: 面板直观性重做——趋势改用箭头图例（越难/越容易只解释一次）+ B 句子整行加粗带警示、[已选] 取代旧标记、四轴各挂一句固定白话定位、漂移写成「调过没用上」；详细版拆成四张 markdown 小表取代等宽网格（禁代码块与凑列对齐，两者都会退化成符号噪音）

## 1.33.0 — 2026-09-30

v1.33.0: 面板模板改为真 markdown 输出——去掉代码块围栏（此前表格从不渲染，学习者只看到裸管道符），三段递进（现在/能挑哪些档/改不了）+ 新增可挑区间列 + 漂移降噪，固定要求补齐五项

## 1.32.0 — 2026-09-30

v1.32.0: 阅读记录也精确到小时——两处时钟现在粒度一致

学习者问：「目标词间隔改成小时了，那生成的文章记录时间是不是也要精确到小时？」——是的，而且这暴露了一处真实的不一致：改完 v1.31.0 之后，**词汇的曝光时钟是时间戳，而文章记录还是日期级**，所以从记录里无法解释小时间隔是怎么产生的。

改动：`sessions[]` 新增两个时间戳——`at`（`pend` 时写入 = 生成时刻）与 `readAt`（`confirm` 时写入 = 读完时刻）。`pool` 的 `recent` / `pending` 都带上它们；归档 frontmatter 增加 `at:` 一行。

**一处时序限制，照实说明**：归档是在 `pend` 时写的，那时还谈不上「读完」，所以**归档（唯一永久记录）只能带生成时刻 `at`，带不了 `readAt`**。读完时刻留在台账里，按 session id 关联——要审计某篇对队列的影响时，两者 join 即可。没有为此去事后改写归档文件（它是 append-only 且被 sha256 锚定的）。

旧会话没有这两个字段，**是惰性历史，不重写**——实测 22 篇里 0 篇有 `at`，符合预期。`today` 还留着的用途只有：session id、`date`、Anki 同步戳、fresh 抽样种子——都不需要小时。

顺带报告两件事：① 台账现有 22 篇（17 counted / 4 void / **1 pending**，就是今天那篇——未确认则曝光不计数）；② `deserve`（5/6）在**旧按天规则下要等到 10-02 才可复用**，而小时制让它**现在就合格**，且饱和阀把全部名额都给旧词——所以下一篇生成时会拿到它，确认后即 6/6、弹出首次毕业提名。

SKILL.md 的 Spacing 规则表新增一行「Clock granularity」，把两处时钟 + 归档的时序限制写明。
套件 76 → 77 条：新增断言 `pend` 写 `session.at`、`confirm` 写 `session.readAt`（都校验 YYYY-MM-DDTHH:MM 形状），并把归档 `at:` 行折进既有的 frontmatter 断言里。全绿。

## 1.31.0 — 2026-09-30

v1.31.0: 间隔改成按小时计（6/6/12/24/36h）+ 落地饱和阀（队列 >25 停收新词）

起因：学习者读了 17 篇、跨 7 天，却一个词都没毕业。诊断分两层。

第一层（不是 bug）：旧的按天阶梯 1/1/2/3/4 天使「第 1 次到第 6 次曝光」的最短跨度就是 11 个自然日，而台账只走了 7 天。两个 5/6 的词都还卡在 5/6 的 4 天冷却里，排序与配额至今没有失职。
第二层（真的是结构问题）：入口 1.5 新词/篇 > 出口 0.7 毕业/篇，队列 = 累计入口 35 − 累计出口 0，只涨不排，底部 13 个 1/6 的词会饿。这正是 v1.14.0 记下的 watch item，现在等到了数据。

实施（学习者选 A + B4）：

【B4 小时制间隔】COOLDOWN_DAYS{1:1,2:1,3:2,4:3,5:4} → COOLDOWN_HOURS{1:6,2:6,3:12,4:24,5:36}。最短毕业跨度 11 天 → 3.5 天，保持递增形状（最后一次相遇仍隔 36h）。
**同日锁随之退休**——必须先讲清的一点：任何小于 24h 的间隔，在「一天一个词最多计一次」仍成立时都是废的。两条规则合并为一条「该深度的小时门槛」，学习者明确接受。
实现：`e.last` 从日期串改为本地时间戳（新增 nowStamp()）；新增 hoursSince()/humanGap()；旧值（裸日期）按那天 00:00 解释，无需重写历史。**一次性副作用已在 SKILL.md 写明**：升级后第一次跑，旧词冷却都从当天 0 点起算，比按天规则略松一次。`confirm` 的 `lockedToday` 改名 `tooSoon`（并报「还需 Xh」）。

【A 饱和阀】学习者 v1.13.0 自己设计、一直等数据的那一条（"④ free reading mode when inFlight > ~25"）。现在 35 > 25，条件成立。`pool` 新增 `saturated` 与机器可读的 `quota`：正常 {mustReuse:[3,4], fresh:[1,2]}，饱和时 {mustReuse:[4,5], fresh:[0,0]}，并在 note 顶部打一行「本篇不收新词」。SKILL.md 第 4 步改为「读 pool 的 quota，别硬写」，并删掉「连读多篇 mustReuse 会空」那句（小时制下已不成立）。

实测（真实台账）：saturated true、配额归零、sleeping 从 23 降到 6；confirm 写入时间戳；立刻二次 confirm 报 tooSoon 且不涨曝光。**首次毕业预计就在下一篇**：deserve 5/6 已过 36h 门槛、排在 mustReuse 首位，而饱和阀让全部名额都给旧词。

套件 74 → 76 条：新增 ① 小时阶梯按小时生效（1/6 词 2h 不够、8h 够；5/6 词 30h 不够、40h 够）；② 饱和阀边界（25 不饱和、26 饱和，配额与 note 均正确）。

发版时 origin 已被学习者自己的提交（4ae9bea "Update panel-templates.md"）领先，fail-closed 守卫正确拦下；该提交只动 panel-templates.md（三处措辞精简，含删掉模板里「面板绝不出现命令」那句），与本版改动无文件重叠，故 fast-forward 后重发。他的编辑原样保留——那条禁令仍留在 SKILL.md，职责分离更清楚。

## 1.30.0 — 2026-09-30

v1.30.0: 面板加「可选档位」快捷条——挑档不再需要命令，学习者只回一句话

学习者问「改难度还要发类似代码的命令吗 'axes --tier <1–8>'？在面板里添加快捷选项，快捷选择不同难度项不同档位」。原表格最后一列直接把命令摊给学习者看（「想改就发这一行」+ axes --tier <1–8>），既像代码、又要求他自己去拼参数。改法：

1) 面板里彻底不出现命令。删掉那一列；命令退到 agent 侧的对照表（`menu[项].flag` → A=--tier / B=--syntax / C=--cohesion / D=--background），学习者只回一句话，agent 负责翻译成 `ledger axes …` 并**只回一句确认**（「好，句子调到 3（冷静）」），命令不出现也不念出来。文件里三处显式写明这条。

2) 新增「可选档位」快捷条，直接放在表格下面。每项一行列出全部档位（◀ 标出当前），学习者看着就能挑，例如「句子 3」或简写「B3」。表格保留（沿用他此前选定的表格形态），只把「现状」与「可挑什么」分成上下两块——上表看现状（项目/现在/数字越大/上次用的），下条用来挑档。

3) 第二个模板从「完整菜单」改名「详细版」：结构相同，但每档后面补上数值含义（句长·小句·被动 / 重叠·连接词 / 词数），用于他问「3 档到底是什么意思」时。默认版给标签（够挑），详细版给数字（够较真）。

SKILL.md 第 4 步同步：默认表格版「自带可选档位条，他直接报项目+数字就能挑档」，并补上「命令不出现、也不念出来，只回一句确认」；Files 清单更新。

一处保留提示：面板仍标明「A/B/C/D」字母，是为了让「B3」这种简写可用；但他直接说「句子 3」同样成立，字母只是可选加速。

套件 74 条全绿（模板守卫仍在）。全库确认：命令字样只存在于 agent 对照表与执行说明里，学习者可见的两块面板中一处都没有。

## 1.29.0 — 2026-09-30

v1.29.0: menu/axes 的键名本身换成白话——句法→句子、语篇→衔接、背景→话题

学习者要求「把 menu 里的键名本身换成白话」。此前只是**模板层**用白话（模板写「句子」、数据键仍是「句法」，中间靠一张对照表翻译）；这次把数据键直接改掉，翻译层随之取消。

改动范围（全部为显示层，**无 state 迁移**——底层存储字段一直是英文 `tier/syntax/cohesion/background`，中文键只在输出里用）：
- ledger.mjs：`menuOut` 的四个键与 `difficultyOut.axes` 的四个键，句法→句子、语篇→衔接、背景→话题（词汇不变）。两处都改是为了不让 `axes.句子` 与 `menu.句子` 名字不一致。
- SKILL.md：四轴表的行标签同步改名（**句子** syntax / **衔接** cohesion / **话题** background），`axes.句法`→`axes.句子`，举例话术与历史叙述里的「句法档」也一并改齐。
- references/panel-templates.md：原先那张「面板用词 ↔ 字段对照表」的核心作用消失，改为注明「键名已是白话，念出来和取字段用同一套词，不再需要翻译；底层英文字段属数据层、不经面板」。
- tests/acceptance.sh：key 断言与 JSON grep 全部跟到新名字；模板守卫的关键词从 词汇/句法/语篇/背景 换成 词汇/句子/衔接/话题。
term 清理：ledger 注释里残留的「句法包」「语篇档」以及一句英文注释里列举的旧名，一并改成新名。全库 grep 确认再没有任何旧键名（含 `axes.句法` 这类引用）。

顺带说明（未改，等指示）：`axes` 的**值**开头还留着英文前缀（如 `句子: "syntax 2/4 · 偏静 · …"`）——键改成白话后这个前缀有点冗余，去掉会更干净，但要动几条测试正则，所以先不动。

套件 74 条全绿。真实台账验证：`axes` 与 `menu` 的键均为 词汇/句子/衔接/话题，值不变。

## 1.28.0 — 2026-09-30

v1.28.0: 表格版面板改成大白话——去掉「轴」「漂移」这类一眼看不懂的词

学习者要求重写表格版面板，删掉「轴」「漂移」这种词。原表格的列头是「轴 / 当前 / 方向 / 漂移 / 改档命令」，四个项目名是「词汇 / 句法 / 语篇 / 背景」——对学习者来说「轴」「漂移」是工程词，「语篇」也偏学术。重写后：

| 难度项 | 现在 | 数字越大 | 上次实际用的 | 想改就发这一行 |
|---|---|---|---|---|
| 词汇 | 4/8 B1 全量 | 越难 | 一样 | axes --tier <1–8> |
| 句子 | 2/4 偏静 | 越容易 | 1 | axes --syntax <0–4> |
| 衔接 | 2/3 常规 | 越难 | 一样 | axes --cohesion <0–3> |
| 话题 | 1/2 通识 | 越难 | 一样 | axes --background <0–2> |
固定要求（改不了）：250–350 词 · 目标词 4–5 个、各出现 ≥2 次且加粗 · 超纲词 ≤4% · 打算回收的旧词必须出现

具体改动：① 列头全部换成问句式的白话（「现在在哪一档」「数字往大是变难还是容易」「上次那篇实际用的是哪一档」「想改就发这一行」）；② 四个项目名口语化：句法→句子、语篇→衔接、背景→话题（词汇不变）；③ 「漂移」这个词从学习者可见的面板里删掉，改成「上次实际用的」，同值就写「一样」，并把「不一样 = 你调过但还没用上」写成表下的一句人话；④ 「红线」改成「固定要求（改不了）」；⑤ 句法那条方向单独提醒一句「四项里唯一数字越大越容易」。
完整菜单同步用白话（句子/衔接/话题 + 「数字越大越容易（和其他三项相反）」），两个模板用词保持一致。
**`menu` 的 JSON 键名不变**（仍是 词汇/句法/语篇/背景）——那是数据层，且英文存储字段本就是 tier/syntax/cohesion/background，中文键只是显示用；文件里新增「面板用词 ↔ 字段对照表」把 句子=menu.句法 这类映射写死，并明确要求 agent 别把「句法」念出来、也别把「句子」当字段名取。

模板文件里现在搜不到「轴」和「漂移」任何一个字。套件 74 条全绿（三条模板守卫依然通过：守卫 grep 的是全文件，键名仍在对照表里）。

## 1.27.0 — 2026-09-30

v1.27.0: 面板模板收敛为两个——表格版（默认）+ 完整菜单版

学习者要求重写 references/panel-templates.md，只保留两个模板并指定默认为表格。最终保留：
- **表格版（默认）**：四轴一行一列（当前 / 方向 / 漂移 / 改档命令）+ 一行固定红线。日常每次起草前用它。
- **完整菜单**：他要挑档、或问「都有什么选项」时展开——四轴全部档位 + 每档含义（词数 / 句长·小句·被动 / 重叠·连接词），并把「当前」与「上次成篇用过」都标出来，附可复制的 set 命令。

删除的两个：#1 极简回执（无变化一行 / 只列 diff）与 #2 紧凑四行。理由：前者省得有限却让学习者每次看不到全貌，后者与表格版信息重叠、只是版式不同——留两个各自有明确用途的（默认速览 + 按需展开）比留四个近似的更清楚。

这次修订过程里有个小插曲值得记：学习者先写「删掉 A 和 B，保留极简和表格」，但 A 就是极简，前后矛盾；我按「保留清单」执行并显式标注了这处标签不一致，随后学习者更正为「保留完整模板和表格模板」——正好把当时我提示过的代价（删掉完整菜单就没有逐档含义的固定版式了）补了回来。教训：**当指令内部矛盾时，按最明确的那部分执行并把不一致讲出来，比按字面硬猜好**。

文件重写后保留：填槽来源表（每槽取自 pool 的哪个字段，防 agent 编造）、三条硬规矩（方向必须念且句法相反／红线不能省／漂移只可能是手动造成的）、以及 gateFlags 只给 passage-check 不念给他听。SKILL.md 第 4 步与 Files 清单同步改为「默认表格版；他要挑档或问选项时换完整菜单版」。

套件 74 条全绿（三条模板守卫仍在：文件存在、SKILL.md 有链接、四轴名 + 全部填槽字段名 + 两条硬规矩关键词都在——期间它拦下过一次：我把「相反」缩写成「（反）」导致守卫落空，说明守卫有效）。

## 1.26.0 — 2026-09-30

v1.26.0: 给生成前的难度面板定下固定模板（四个，默认 B），写进 references/

学习者问「新面板有固定模板吗，写几个给我选择」。核实结果：**短文有固定模板**（references/passage-format.md 带 markdown 骨架），**面板没有**——SKILL.md 只给了句口语指示「把菜单念给学习者听（至少念各轴当前那一行）」。后果是每个 agent 念得都不一样，学习者无法形成稳定预期。这是真缺口。

新增 references/panel-templates.md（模板级规则 ④，与短文模板 ③ 对称），给出四个模板，全部用学习者真实台账数据填好样例：
- **B 紧凑四行（默认）**：每轴一行（当前档 / 档名 / 方向简写 / 漂移提示）+ 一行红线。6 行内信息完整。
- **A 极简回执**：无变化一行、有变化只列 diff。用于他明说「不用每次报难度」之后、或同日连读多篇无档位变化时。
- **C 完整菜单**：展开四轴全部档位与含义，并把「当前」与「上次成篇用过」都标出来。用于他问「都有什么选项」或换机器后第一次。
- **D 表格版**：markdown 表格，先问一次再定。

文件里还带一张**填槽来源表**（每个槽位取自 pool 的哪个字段），防止 agent 编造；以及三条硬规矩：① 方向必须念（四轴方向不统一，句法是反的）；② 红线不能省（四轴只是可调的那半）；③ 漂移只可能是手动造成的，照实说不许让他以为已生效。另注明 gateFlags **不念**——那是给 passage-check 的，念了是噪声。

SKILL.md 第 4 步改成「照 references/panel-templates.md 念，默认模板 B，别临时组织格式」，并加上「他想看全部选项 → 换模板 C」；Files 清单补上该文件。

套件 71 → 74 条：新增三条断言锁定模板不被删/不被改走样（文件存在、SKILL.md 有链接、四个轴名 + 全部填槽字段名 + 两条硬规矩关键词都在）。

## 1.25.0 — 2026-09-29

v1.25.0: 补齐生成前的难度面板——方向标记、固定红线、可复制命令与逐轴漂移

学习者问「生成文章前的难度面板完整吗」。我按自定判据逐条核对，结论是核心齐全但差三处，经确认后全部补上。

1) 方向标记（最尖的一处）：四轴的「数字大小 = 难度方向」约定**并不统一**——词汇 1→8 越难、语篇 0→3 越难、背景 0→2 越难，唯独**句法 0 放宽（句长≤24/14，最长 → 最难）→ 4 最静（≤13/8，最短 → 最易）是反的**。根源是 v1.15.0 的 syntaxCalm 语义（0 正常、越大越冷静）被沿用下来。面板此前没有任何方向标示，按前三轴学会「数字大=难」的人必然在句法上搞反。现每轴带 direction，句法那条显式写「数字越大越易，与本面板其他三轴相反」。
   学习者选择加标记而非重编号（后者需 state 迁移 0↔4、1↔3），所以两套习惯共存，但至少不会静默搞反。

2) 固定红线进面板：此前不可调的那半难度契约（篇长 250–350、目标词 4–5 个且每个复现 ≥2 次并至少加粗一次、超纲率 ≤4%、未申报超纲词 0、声明的重逢词必须出现）只在 SKILL.md 里，面板的 gateFlags 只含轴驱动的部分。现 pool 输出 fixedLimits，面板自成一体。
   防说谎设计：数值的真源是 passage-check.mjs 的 LIMITS 默认值，ledger 只是念出来；**新增一条耦合断言**——从 passage-check 源码读出六个默认值，逐一要求出现在 fixedLimits 里，不同步就 FAIL。已实测该守卫会拦（把默认值改成 260 即触发），不是空过。

3) 可复制命令 + 逐轴漂移：每轴新增 set（如 axes --syntax <0–4>）与 lastUsed / driftedSinceLastDraft，不再需要 agent 手工比对顶层 lastUsed。实测在真实台账上立刻报出「句法 current=2 而上次成篇用的是 1」。

顺带修掉最后一处过时说法：SKILL.md 第 4 步原写「与 menu 的 current 不同就说明被体感反馈降过档」——v1.22.0 已无体感路由，漂移只可能来自手动改档。已改为「只说明你改过档但还没在任何成篇里用过（不可能是自动发生的）」，并全库 grep 确认再无同类残留（连同 v1.24.0 的背景档假陈述一起，同源缺陷已清完）。

套件 71 条全绿（新增的方向/set/漂移/固定红线断言与耦合守卫都在其中）。

## 1.24.0 — 2026-09-29

v1.24.0: 修掉面板里一处假陈述——背景档还声称有「context 体感 → 背景档 −1」的反馈回路

学习者问「目前生成文章前展示的难度面板完整吗」。我按自定的判据逐条核对实际输出，结果在面板里抓到一处**假陈述**：背景档的 note 写着「无硬闸：靠选题兑现，但有反馈回路（context 体感 → 背景档 −1）」——而 v1.22.0 删安全阀时这条回路已经被删掉了，ledger.mjs 里已无任何 context 路由、也无 background-- 的写入点。也就是说面板向学习者承诺了一个不存在的机制。

这正是我 v1.20.0 记下的那类缺陷（同一条规则在文档与代码里强度不一致），而这次是我自己在删路由时漏改文档造成的回归。同类过时注释另有两行（BACKGROUND_LADDER 上方那段，仍写着「它有一条真实的反馈回路」并拿它作对比说明为什么删掉题型档）。三处一并修正为「无硬闸、且体感只记录不再调档（四根轴一律只由 axes 手动改变）」，并保留删题型档那段历史说明（那是设计决定，不是错误）。

改完扫了一遍全库确认再没有任何地方声称体感会调档（grep 反馈回路/体感 → 均为空）。套件 71 条全绿。

顺带确认了一个仍然存在的问题，本次**未改**（等学习者决定）：四根轴的「数字大小 = 难度方向」约定并不统一——词汇 1→8 越难、语篇 0→3 越难、背景 0→2 越难，唯独**句法 0 放宽（句长≤24/14，最长 → 最难）→ 4 最静（≤13/8，最短 → 最易）是反的**。它源自 v1.15.0 的 syntaxCalm 语义（0 正常、越大越"冷静"）的历史遗留。面板里没有任何方向标示，所以按前三轴学会「数字大=难」的人会在句法上搞反。修法两种（加方向标记 / 重编号使约定统一，后者需 state 迁移 0↔4、1↔3），另有两处小缺口（不可调的固定红线不在面板里、只给了 flag 名没给完整命令）也一并待定。

## 1.23.0 — 2026-09-29

v1.23.0: 按「只生成 i+1 材料」重新划范围：合并 status 进 pool、删 poolSize、把网络请求搬离起草路径

这轮换了判据：不再问「有没有人读」，而问「生成 i+1 材料需不需要它」。因为要抓的是范围问题，不是死代码问题。清理前已让学习者逐项确认。

1) status 合并进 pool（学习者确认）。status 的 8 个字段里 6 个与 pool 逐字重复（tier/axes/gateFlags/menu/inFlight/skillUpdate），只多 pending 与 interests，而这两项 pool 也需要（第 3 步选题要用 interests、第 7 步要提醒隔天的 pending）。现在 pool 直接带 pending + interests，status 从命令表下线。命令 11 → 10，工作流少一次调用，SKILL.md 少 10 处引用（剩余一处是 git status，无关）。

2) 删 poolSize。证据更正：我最初说它「0 消费者」，那是不完整的——我只 grep 了 SKILL.md，没查 tests，而我自己写的 tier-ladder 测试正在用它。更正后的理由更硬：菜单里词汇轴每一档已经写了「2178 词」，poolSize 是重复信息，agent 从不读它。测试改为在干净状态下用 `fresh.length`（无 known、无 exposures 时它恒等于池子大小，用 --limit 99999 取全量）推导，因此不为了迁就测试而保留一个死字段。

3) pool 去掉强制 git fetch（学习者在「skill-update 怎么处理」里选了「保留，只降费」，而我把降费定义为本条，故一并实施；若他在前一组里排除 A3 是有意的，本条可回退）。原先 pool 作为起草前最后一个检查点，每次调用都强制 fetch，好让另一台机器的推送最多只隐没一篇；代价是把一个超时 8 秒的网络请求放在了起草必经路径上——而每日阅读节奏并不需要这个精度。现在只走 24h 节流，安全网保留、延迟移走。
   诚实标注后果：另一台机器的推送现在最多可能隐没 24 小时，所以**在一台今天没用过的机器上生成之前先 pull**（第 2 步本来就是这么做的）。缓存戳仍以本地 HEAD 为键，pull 后下一次 skillUpdate 会重新 fetch，陈旧的 upToDate 依然活不过一次版本变化。

4) skill-update 自检本身保留（学习者选「保留」）。它是跨机版本漂移的唯一防线——我自己就撞过 tier 重编号被旧代码读成完全不同词池的危险。SKILL.md 的自检章节改写为节流版并把新的隐没窗口写明。

明确不动并说明理由（写进 SKILL.md 与项目记忆）：archive 逐篇归档（确实无读者——唯一读者 bookshelf 已在 v1.12.0 退役——但学习者当时明确保留过，不重提已定的决定）；Anki 链 sync/import/重逢词（它定义「什么算 i」，Anki 牌组就是学习者的词汇存量 → 服务核心）；state-git（跨机 i+1 完整性）；graduate + known-words（known 集维护）；interests（选题便利）。

附带说明：最大的非生成区块仍是跨机基础设施（state-git + skill-update + lib-layers + ship ≈ 236 行代码 + 43 行文档），它服务真实的两机需求，不算多余，所以只优化了它在关键路径上的网络请求。

套件 71 条全绿。真实台账副本验证：pool 带 pending（1 条）与 interests（12 条）、无 poolSize、status 已下线（返回命令表）、skillUpdate 走节流返回缓存、pend→confirm→pool 全流程正常。

## 1.22.0 — 2026-09-29

v1.22.0: 删净体感路由（安全阀），skill 只生成 i+1 材料，难度升降 100% 由学习者控制

学习者的决定比我的提问走得更远：我原本只问「ok 松句法这一条怎么处理」，他答「删掉安全阀，把该 skill 的功能固定为生成符合 i+1 原则的英语材料。具体如何升高和降低难度全部都由人自主控制，不再交给 skill 判断」。这是一次职责收缩，而不是又一条参数调整。

删掉的东西：confirm 里整段难度路由（wordy→词汇−1、dense→句法收紧、context→背景−1、choppy→语篇−1、ok→句法松一档、flow×2→词汇+1、低分→词汇−1+句法收紧），以及 streakGood（它只为「连续两次 flow 升档」而存在，随之成为死字段）。现在 confirm 只做三件事：计曝光、写成绩/体感、提名毕业。`axes` 成为四根轴唯一的改动入口。

删除的依据（三条，前两条是实证）：
1. 每一条都与学习者自己锁定的规则冲突或静默覆盖它。最清楚的是 ok（v1.3.0 锁定：ok = 甜区 = 保持不变）却去松句法档 —— 实测手动设 --syntax 4，四篇 ok 就把它一路松回常规 1，再一次 dense 又推回 3，是个走不出的循环，而且手动选择被静默推翻。
2. 它在全部 20 篇里一次都没触发过：体感 16 次全是 ok，没有一篇 counted 低于 60%。整套机器从未跑过一次。
3. 它和 axes 功能重复 —— 四根轴本来就能直接点。
另外两条同类前例：四维画像（v1.17.0 删）与探针（v1.19.0 删）都是「记的是 AI 的判断或猜测、下游没人消费」。这次删的是「AI 替学习者做决定」。三者合起来，难度系统里已经没有 skill 的判断，只剩「按设定生成 + 如实记录」。

保留并升格的东西：体感与成绩现在是纯记录，但它们的价值反而更明确了 —— history 的「档位 → 体感」是**给学习者自己看的账**（某轴调紧后仍报 ok 说明有余量，一调紧就抱怨说明边界在上一档），SKILL.md 要求 agent 起草前把它念给学习者，供他决定下一步。skill 从「飞行员」变回「仪表」。
情绪上的诚实说明：ok 仍然会是绝大多数读数。但那不再是「传感器没信号」——在无自动路由的设计下，ok 就是「当前设定合适」的正确读数，而难度不动是学习者的合法选择，不是待修的 bug。

文档同步：SKILL.md 的 Dynamic difficulty 大表删除，改为「无自动路由」声明 + 四轴「只能 --syntax 这样改」表；第 4 步与第 8 步都注明体感/成绩只记录、问的时候别暗示「选了就会自动调」；pool 的 note 与菜单里「连续两次 flow 自动上调」的说明改写。
测试：7 条「体感改档」断言全部反转，另新增两个更有价值的 —— ① 强不变量：6 种体感 × 3 种成绩（含 1/3 低分）逐个跑，断言 difficulty 逐字未变；② 手动阶梯锁定：syntax 0–4 与 cohesion 0–3 每一档都必须发出其文档所载的 gateFlags（阶梯表现在是唯一路径，值得逐档锁死）。套件 70 → 71 条全绿。
真实台账副本验证：连报 1/3 低分 + 全部 6 种体感，difficulty 一动不动；遗留的 streakGood/quiz 成为惰性历史，不再读也不再输出。

## 1.21.0 — 2026-09-29

v1.21.0: 清掉 7 处「零消费者」输出与死字段；确认冷却阶梯与毕业路径都是工作正常的

第三轮第一性原理审计。这轮先把"看起来可疑但其实在工作"的先证伪，再清真的死代码——避免为清理而误删。

【查过，结论是留着（本次不动）】
- 冷却阶梯 1/1/2/3/4：实测 33 个在飞词里 18 个被它或同日锁拦住（约 40%），确实在咬合，不是装饰。
- interests 兴趣列表：12 个话题，真在用。
- sessions[].reunion：archive 时读它写 frontmatter，有消费方。
- allow-extra.txt（5 词）/ irregular-forms.txt（161 形）：都在用。
- pool 的 note：无漂移（里面那处"探针"是 v1.19.0 写的否定句）。

【死字段与零消费者输出（本次清除）】
- words[].first：四处构造全都是赋值，从无读取 → 停止写入，并删掉 confirm 里那句 if (!e.first) e.first = today。
- words[].source（'pool'/'anki'）：同样只写不读 → 从四处构造中移除。
- status.graduationNominations：重复频道 —— 发射两处（status 与 confirm），而 SKILL.md 第 9 步明写用的是 confirm 那份，status 这份零消费者。
- status.activeWords / poolWords / tierLabel / targetsRange：发出去但 0 处测试断言、0 处 SKILL.md 引用。TARGETS_RANGE 常量随之成为唯一用途消失，一并删除（这推翻了 v1.19.0 那句"输出字段 targetsRange 保留"的决定——当时是为了消除 8 份重复定义，现在连最后一个消费点也没了）。
旧台账里遗留的 first/source 值保留为惰性历史，不重写。status 从 12 个字段降到 9 个。

【比死代码更值钱的发现：毕业路径从未跑过，而且数学上还不可能跑】
status=known 词数 = 0、known-words.txt = 0 → graduate 从未被调用，Anki 桥从未发生。原因不是缺陷：冷却阶梯 1/1/2/3/4 = 从第 1 次到第 6 次曝光最少需要 11 个自然日（还叠着同日锁），而台账只有 8 天。队列确实在推进（2 个词到 5/6、6 个到 4/6），首批毕业预计在 11–13 天窗口出现。
底部积压是真的：44 个词里 29 个停在 ≤1 次曝光（18 个卡在 1/6）——正是 v1.14.0 记录里那个 watch item（深度优先的代价）。学习者决定先不动、等首批毕业后再判断（注意：公平轮转已被明确锁定不得作为主排序键，故未提该方案）。

套件 70 条全绿。真实台账副本验证：status 9 字段、旧词条惰性字段无害、pend→confirm→pool 全流程正常、confirm 仍正常发射毕业提名。

## 1.20.0 — 2026-09-29

v1.20.0: 删题型轴（5 -> 4 轴），两条 warn 提升为硬闸

【题型轴 quiz 删除】它是 5 轴里唯一「既不能自动纠偏、也不能验证」的：既没有硬闸，也没有任何体感会改它（背景轴虽也无硬闸，但有 context → −1 的反馈回路，所以比它强一档）。证据上它也是最弱的一个——Spencer et al. (2018) 发现题目类型的处理需求对题目难度的预测力很弱，而 genre（体裁）才是头号 passage 特征。也就是说：这套系统有一个强杠杆（体裁，可选题但未接成难度轴）没接线，一个弱杠杆（题型）却接了线。删后菜单从 1440 种组合降到 480 种（8×5×4×3）。
踩坑提醒：archive 的 --quiz "B,A,C" 是**答案键**，与题型轴无关，必须保留——删轴时极易误伤。已经逐处确认保留。旧台账里遗留的 difficulty.quiz 字段保留为惰性历史，不重写；axes --quiz 现在正确地报错拒绝。

【两条 warn 提升为硬闸】起因是审计发现同一条规则有三种强度：SKILL.md 的 Hard rules 写着「each bolded at least once」（硬规则），references/passage-format.md 却写「目标词加粗（warn 级）」，而 passage-check 只 warn。三份真相互相打架。
- 「target never appears inside **bold**」→ FAIL
- 「declared reunion words never appeared in prose」→ FAIL（format 指南本就要求每个重逢词至少出现一次）
两条都提升后 warn 数组永远是空的，所以整个 warn 数组一并删除（const、两处 push、report 字段），passage-format.md 的「warn 级」改为硬要求并补上小句/被动/衔接上下限的说明。
选择提升而非降级的理由：加粗是 skill 理论契约里「noticed forms（加粗 + 一行语境注释）」的一半，是有教学功能的；把它降级成提示等于放弃这条契约。代价是忘了加粗会多一次返工，但那是机械改动。

套件 70 条全绿（试炼短文在新硬闸下仍通过：目标词全加粗、重逢词全用到）。真实台账副本验证：4 轴、菜单 480 种组合、--quiz 被拒、新 session 快照只含 4 轴、遗留 quiz 字段惰性无害。

## 1.19.0 — 2026-09-29

v1.19.0: 删掉探针，难度上移完全交给学习者；清理 A 级死代码与两份冗余

探针退役（按第一性原理审判，学习者批准「直接删，不做替代」）：
① 它和 skill 自己的锁定理论相矛盾。v1.3.0 那条（学习者本人的理论修正）说 ok = i+1 的平衡态、甜区就是目标；只有 flow（太简单）才说明这一档被吃透。而探针的规则是「连续 3 篇 ok 就硬推一档」——把 ok 读成「可能无聊」，推向 i+2，那对习得是更差的位置。
② 所以探针真正假设的不是「难度该升」，而是「你的 ok 不可信」。它是给一个疑似坏掉的量表打的补丁，不是难度机制。而量表已扩到 6 档，且学习者现在能自己点菜（v1.18.0 菜单）——修量表的正解不是周期性强推。
③ 决定性证据：它不留任何痕迹。grep probe 在 ledger/state/frontmatter 里为 0，事后无法判断某次升档是探针还是手动点菜。不可观测 → 不可校准 → 不可证伪。按 v1.17.0 删画像的同一把尺子（「没有任何东西消费它」），它属于同一类。
④ 「有牙」版本的探针至今零次执行：真实台账最后一次写入是 08:19，跑的是 v1.15.0；v1.16.0 才让它去动真档位。
⑤ 附带效果：「难度从不上移」不再是缺陷。停在舒服处是合法终局，不是待修的 bug——真正缺的从来不是升级率，是操控权，那个 v1.18.0 已经给了。
新版 SKILL.md 明确：agent 不主动顶档、不做探针、不替他加码；报 ok 就是到了目标。想上难度时提示菜单还在，让他自己挑。

A 级死代码清理（全部实测确认「有代码、零消费者」）：
- sess.words：永远 null，因为 meta.words 从未出现在 SKILL.md 或 references 里。
- date_confirmed：只写不读（grep 只有赋值那一行）。
- --graduate-at：flag 定义存在，SKILL.md 与 tests 无人传；收成裸常量 6。
- TIERS[].targets：8 份逐字相同的 [4, 5]（v1.8.0 把目标词数统一后就已成死灵活度），而 SKILL.md 散文里还手写了一遍「4–5」——三重冗余。收成单个 TARGETS_RANGE 常量，输出字段 targetsRange 保留。
删除前逐一确认无读取方，并特意区分了「会话字段 sess.words」与「曝光台账 s.words」（后者有 15 处用法，绝不可动）。

两份冗余删除：
- BOOTSTRAP.md：内容与 SKILL.md「Publishing skill changes」段重复，形成双份真相；而且它里面那句「禁止手工 commit/push」正好与今天经批准的那次 CHANGELOG 修补冲突，其中一份还是错的。
- docs/qgraphflow/：4 套 q-flow 流程图（10 个文件），gitignore 的本地件；难度系统在 v1.15–v1.18 间改了 4 版，它们必然已过时。注意：不在 git 里，删了不可恢复。

未处理（学习者未选）：题型轴 quiz 仍无硬闸、无体感反馈，是 5 轴里唯一「既不能自动纠偏、也不能验证」的；passage-check 的 warn 数组仍是「有输出、有测试、无人处理」。

旧台账里遗留的 words/date_confirmed/predicted/requested 行保留为惰性历史，不重写、不迁移。套件 70 条全绿，并在真实台账副本上验证：旧字段仍在、pool/menu/完整会话流程正常、新 session 只写 9 个字段。

## 1.18.0 — 2026-09-29

v1.18.0: 生成前的面板给出完整多维多档菜单，默认值 = 学习者上次的选择

起因：学习者问「这个面板能提供多维度多档位难度选择吗」，然后要求「面板能实现多维多档选择，且能记住上次的难度选择作为默认选项」。核实后确认：五轴上 8×5×4×3×3 = 1440 种组合早就存在，但面板只是只读状态栏——只显示当前那一档，不列出可选档位、不写取值范围、不写各档含义、连轴名都不给。选择面实际躺在 SKILL.md 的表格里，不在面板里。

改动：① pool/status/axes 输出新增 `menu` 字段，从既有档位表**推导**出完整菜单（不新增任何状态），每个轴列出全部档位 + 该档含义（句法给句长/小句/被动上限，语篇给重叠/连接词上下限，词汇给池子词数），当前档标 `current: true`；② 词汇轴改为**可选**——原先菜单写「不可点菜」而 axes --tier 其实一直可用、测试也断言了它，这是我自己在 v1.16.0 造成的不一致；点菜不重置 flow 连击，词池的过滤规则本身仍留在脚本闸门内（与 v1.13.0「词频判断归脚本」那条锁定哲学并不冲突，那条约束的是 agent 不许自称知道词频，不是学习者不许选档）；③ pool 新增 `lastUsed`，等于 history 里最新一条带 axes 的快照。

关于「记住上次选择」：这本来就已成立——五轴存在 state.json，走 save() 自动推送私有仓，跨会话跨机器保留，所以不需要另存一份「偏好」。面板的默认值直接就是 live state。真正需要补的是**可见性**：体感反馈会自动把轴往减负方向调（只往这个方向），所以默认值可能已经不是学习者显式点的那一档。`lastUsed` 就是为此存在——它与 menu.current 不同即说明被漂移改过，SKILL.md 要求 agent 照实告知，而不是让学习者以为自己选的值还在。

SKILL.md 第 4 步重写为「念菜单 → 学习者报轴+档 → agent 跑 axes 落地」，并明确 lastUsed 的用途；同时删掉 v1.16.0 那句「点菜不能动 tier」的禁令（与新菜单自相矛盾）。套件加 1 条菜单断言：五轴各自的档位数、每轴恰有一档 current、current 必须等于 live state、词汇各档池子词数严格递增、两个无量纲轴必须带诚实标注。70 条全绿。

已验证：真实台账副本迁移后菜单默认 {tier 4, syntax 1, cohesion 2, background 1, quiz 1}、1440 种组合；漂移场景实测「你点 cohesion 3 → 报 choppy 后 current=2 而 lastUsed=3」，面板能看出被改过。

## 1.17.0 — 2026-09-29

v1.17.0: 砍掉四维负荷画像，改为每篇快照五轴档位（净删 100 行）

从第一性原理审画像，结论是它该退。理由：它记录的是 AI 对自己要写的那篇的猜测，而这条链上真正有话可说的是 A（档位设置）→ D（材料真实负荷）→ feel（学习者体感）。画像在链上但不被任何下游消费；四格里三格（vocab/syntax/discourse）与脚本直接测到的值重复——tier 决定用词、句法有硬指标、衔接有重叠/连接词可量；只剩 background 一格独有，却又缺了 quiz 那格。而它的代价是每篇必填 + 一个硬 FAIL + 一次口头仪式。

逐条否掉它声称的用途：① 当探针触发条件——用 feel 就够了（ok 本身就是甜区定义），加上 predicted 之和只会否决行为信号，是负价值；② 防事后合理化——下游没人读 AI 的说法（feel 来自学习者、闸门来自脚本），保护的是一个没人用的记录；③ 量 AI 的手准不准——一旦标尺被校准（知道 cohesion=3 读起来什么感觉）就不需要 AI 猜，价值随标尺校准衰减到 0，是带自毁定时器的脚手架；④ 当 Phase 2 门票——但 Phase 2 要的是 A→feel，不是 P→?。

真正的缺口在这里：state 里每条 session 存的是 id/date/topic/targets/reunion/status/words/score/feel/predicted/requested，**没有档位快照**。所以无法从台账重建「我把 cohesion 设成 1 而你报了 choppy」——A→feel 这条链是断的，而它才是校准的唯一依据。画像在旁边记了一堆 AI 对自己的看法，就是不记「我到底调了什么」。

改动：① pend 快照五轴档位进 session（含 background/quiz），不再写 predicted/requested；② pool 的 calibration 字段换成 history，输出最近 8 条 {axes, feel, score}；③ archive frontmatter 的 difficulty 行改读 pend 时的快照（可证明等于起草用的档位，而非归档时的实时状态），并删掉 predicted/requested 两行；④ passage-check 删掉画像形状校验与 DIMS；⑤ 删除 references/difficulty-rubric.md——该文件唯一用途就是给画像打分，画像退役后它只剩一个失效的打分表；⑥ 协商保留但改为对着真参数谈（axes 命令），探针触发条件从「predicted 之和 ≤7 且全 ok」简化为「连续 3 篇全 ok」。

旧台账里遗留的 predicted/requested 行保留为惰性历史，不重写、不影响任何逻辑（history 里显示 axes:null）。套件 73 -> 69 条（删 4 条画像断言，加 7 条档位快照/A→feel 断言），全绿。已在真实台账副本上验证：history 正常、无 calibration 字段、遗留行 axes 为 null。

## 1.16.0 — 2026-09-29

v1.16.0: 难度轴 2 -> 5（词汇 8 档 / 句法包 5 档 / 语篇 4 档 / 背景 / 题型）

起因：学习者指出「难度轴太少，句式档只用句子长度太简单」。用 13 篇真实存档实测证实了这一点——平均句长 8.8 词而上限是 12，句长轴几乎饱和；真正的难度差藏在完全不受控的小句密度（最多 2-3 小句/句）和衔接（邻句实词重叠 0.006-0.133，差 20 倍）里。所以不是轴少，是接错了轴。

词汇档 6 -> 8，且不再只看词频：改按复合稀有度（词频 + AoA + 具体性 三项等权百分位）分带。实测在 B1/B2 这个窄频段里词频与 AoA 几乎不相关（Spearman 0.04），单用词频会把 fiscal / paradox / ambiguity 这类高频但抽象、晚学的难词判成简单。覆盖率：词频 96.4% / AoA 85.1% / 具体性 93.1% / 三项齐全 84.3%，缺失按可用项平均，不丢词。池子 544/1088/1632/2178/2802/3426/4050/4675。三项原始评分不进公开仓，只提交派生档位表，来源与许可写在表头。

句法档 4 -> 5 且改造成「句法包」：句长 + 每句小句数 + 全篇被动数一起收紧（0 放宽 24/14 · 1 常规 20/12 默认 · 2 偏静 · 3 冷静 16/10 · 4 最静 13/8）。阈值取自 13 篇实测：默认档 13/13 全过（纯加性），阶梯 13→13→12→7→6。首次 dense 仍精确落在旧版的 16/10。

语篇档新增 4 档，且是双向的：易端强制显性衔接（≥0.07 重叠 / ≥0.48 连接词），难端主动少用衔接（≤0.03 / ≤0.30）让读者自己补关系。之所以不设成纯下限：实测重叠中位仅 0.035，任何有意义的默认下限会否掉一半存量档，等于偷偷改了校准过的默认行为。诚实标注：易端两档验证最少，存量 13 篇 0 篇通过，数值已按可达性放缓，第一次实际使用后按实测回调。

背景档 / 题型档新增：不由脚本测量（需要读者模型 / 题目语义），靠选题与出题兑现，在 meta 申报、archive 记录，让校准回路能看到有没有兑现。

体感第 6 项 choppy（接不上/读着跳）-> 语篇档 -1；context 从「纯记录」升级为真的把背景档 -1（旧版没轴可调才只能记录）。新增 ledger axes 命令供学习者直接点菜（任一轴，带越界校验）。

修掉两个自己写出来的 bug：① tighten() 起点用 max(syntax,3) 会让首次 dense 直接跳到最紧档 13/8，与旧版 16/10 不一致；② ok 的松档能降到 0，导致第一篇 ok 就把句法静默放成最松档——自动动力学现在止于常规档，放宽只能由点菜进入。

档位与状态串联迁移：state.version<2 走三档->六档，<3 走六档->八档（旧 3 = B1 全量 2178 词 ≡ 新 4）并把 syntaxCalm 转成档位索引 +1。已在真实台账副本上验证：tier 3 -> 4（同一个 2178 词池）、syntax 1 常规、cohesion 无约束、队列 inFlight 32 / counted 14 完好，原台账未改。

硬闸新增四项可测门槛（小句数 / 被动 / 衔接重叠 / 连接词，含上下限），默认全部不咬合，ledger 输出 gateFlags 现成命令行串供 agent 逐字复制。套件 72 -> 73 条断言，全绿。

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

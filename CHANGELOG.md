# Changelog

Auto-maintained by scripts/ship.mjs — newest first.

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

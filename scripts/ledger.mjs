#!/usr/bin/env node
// Exposure ledger + dynamic difficulty for english-context.
// State lives in ~/.english-context/ (override with --state-dir or EC_STATE_DIR).
// Commands: init | status | pend | confirm | void | graduate | import-anki | pool | interest | archive

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { skillUpdate } from './skill-update.mjs';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv;
const cmd = argv[2];
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const stateDir = arg('state-dir', process.env.EC_STATE_DIR || join(homedir(), '.english-context'));
const stateFile = join(stateDir, 'state.json');
const knownFile = join(stateDir, 'known-words.txt');
const ankiFile = join(stateDir, 'anki-words.json');
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD, not UTC
// Local YYYY-MM-DDTHH:MM:SS. Second-precision since v1.43.0 so the reading site can show when a
// passage was ordered; the cooldown math below is still hour-based and reads either granularity.
const nowStamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
// A legacy `last` is a bare YYYY-MM-DD: read it as that day at 00:00 local. (Consequence stated in
// the changelog: the first run after upgrading cools every old word from midnight, i.e. slightly
// earlier than the day-based rule did.)
const hoursSince = (v) => {
  if (!v) return Infinity;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00' : v;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
};
const humanGap = (h) => (!isFinite(h) ? '' : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);

// v1.16.0 — 8 档单调阶梯（v1.15.0 是 6 档，按纯词频分带）。
// 词池改按「复合稀有度」分档：assets/word-bands.tsv 里的 band 由 词频 + AoA + 具体性
// 三项等权百分位合成（理由见该文件头部）。B1 / B2 各切四段，逐档并入 —— 档越高，
// 允许出现的难词越多。旧 6 档的池子大小仍被保留为迁移锚点：旧 3（B1 全量）= 新 4。
const TIERS = {
  1: { b1: [1], b2: [], label: 'B1 易段' },
  2: { b1: [1, 2], b2: [], label: 'B1 易+中易' },
  3: { b1: [1, 2, 3], b2: [], label: 'B1 易+中易+中难' },
  4: { b1: [1, 2, 3, 4], b2: [], label: 'B1 全量' },
  5: { b1: [1, 2, 3, 4], b2: [1], label: 'B1 全量 + B2 易段' },
  6: { b1: [1, 2, 3, 4], b2: [1, 2], label: 'B1 全量 + B2 易+中易' },
  7: { b1: [1, 2, 3, 4], b2: [1, 2, 3], label: 'B1 全量 + B2 易+中易+中难' },
  8: { b1: [1, 2, 3, 4], b2: [1, 2, 3, 4], label: 'B1+B2 全量' },
};
const MAX_TIER = 8;
// v1.16.0 — 句式档 5 档（v1.15.0 是 4 档，且只卡句长）。句长轴过去是饱和的：实测 13 篇
// 存量档平均句长 8.8 词而上限是 12，几乎没有咬合；真正的难度藏在「小句密度」里
// （实测最多 2–3 小句/句，完全不受控）。所以每档现在是一个「句子包」：
// 句长 + 每句小句数 + 全篇被动句数一起收紧。clauses/passives 的上限取自 13 篇存档的实测分布，不是猜的。
// v1.36.0 — **索引整体翻转**：现在「数字越大越难」，与词汇/衔接/话题一致。旧序是 0 常规向上变「静」
// （继承 syntaxCalm 的 0=常规、越高越静），四轴里只有它反着，学习者按同一套直觉点菜就会读反。
// 难度包本身一字未动，只是索引反写：新 i = 4 − 旧 i。落盘状态与每篇的档位快照在 load() 里
// 随 state.version 4 一次性翻转（旧档的 passages 文件不改写，见迁移注释）。
const SYNTAX_LADDER = [
  { max: 13, avg: 8, clauses: 2, passives: 0, label: '最静' },
  { max: 16, avg: 10, clauses: 2, passives: 1, label: '冷静' },
  { max: 18, avg: 11, clauses: 3, passives: 1, label: '偏静' },
  { max: 20, avg: 12, clauses: 4, passives: 2, label: '常规' },
  { max: 24, avg: 14, clauses: 5, passives: 4, label: '放宽' },
];
const MAX_SYNTAX = SYNTAX_LADDER.length - 1;
const SANE_SYNTAX = 3; // 常规（翻转后 = 旧 1）：新台账的起点、以及台账缺字段时的读取兜底（v1.22.0 起不再有任何自动衰减）
// v1.16.0 — 衔接档 4 档，**双向**：易端设衔接下限，难端设衔接上限。
// 只设下限是不行的：实测邻句实词重叠率中位仅 0.035（区间 0.006–0.133），任何有意义的默认
// 下限都会否掉一半存量档，等于偷偷改了校准过的默认行为。所以默认档（2）不设约束，
// 「更难」= 主动少用显性衔接（重叠 ≤0.03、连接词 ≤0.30），让读者自己补关系；
// 「更易」= 强制显性衔接。阈值取自 13 篇实测分布（重叠 0.006–0.133/中位 0.035，
// 连接词 0.24–0.63/中位 0.42）。
// ⚠️ 诚实标注：易端两档（0/1）是**验证最少的两档** —— 存量 13 篇里没有任何一篇能同时
// 满足它们的两个下限（高重叠那篇连接词只有 0.28，13 篇里 0 篇通过）。数值已按可达性放缓，
// 但到底好不好用要等第一次实际使用；届时按实测回调。
const COHESION_LADDER = [
  { minOverlap: 0.07, minConnectives: 0.48, maxOverlap: 1, maxConnectives: 99, label: '紧扣' },
  { minOverlap: 0.05, minConnectives: 0.40, maxOverlap: 1, maxConnectives: 99, label: '偏紧' },
  { minOverlap: 0, minConnectives: 0, maxOverlap: 1, maxConnectives: 99, label: '常规' },
  { minOverlap: 0, minConnectives: 0, maxOverlap: 0.03, maxConnectives: 0.30, label: '松' },
];
const MAX_COHESION = COHESION_LADDER.length - 1;
const SANE_COHESION = 2;
// 背景档不由脚本测量（需要读者模型），只由 agent 在选题时兑现，并在 archive 时进 frontmatter
// 让人事后看得到。它**没有硬闸**——而 v1.22.0 删安全阀之后，它连"体感自动纠偏"这条软回路
// 也没有了：四根轴一律只由 `axes` 手动改变。
// v1.20.0 删掉了题型档（quiz）：它当时是 5 轴里唯一「既不能自动纠偏、也不能验证」的，
// 而且研究里题型对题目难度的预测力很弱
// （Spencer et al. 2018：题目处理需求对 item difficulty 预测力弱，genre 才是头号 passage 特征）。
const BACKGROUND_LADDER = ['兴趣内话题', '通识话题', '新领域话题'];
const MAX_BACKGROUND = BACKGROUND_LADDER.length - 1;

const clamp = (v, max) => Math.min(max, Math.max(0, v));
const syntaxLevel = (s) => SYNTAX_LADDER[clamp(s.difficulty.syntax ?? SANE_SYNTAX, MAX_SYNTAX)];
const cohesionLevel = (s) => COHESION_LADDER[clamp(s.difficulty.cohesion ?? SANE_COHESION, MAX_COHESION)];
// 硬闸命令行串：agent 必须逐字复制，不再靠"记得传"
const gateFlags = (s) => {
  const sx = syntaxLevel(s), co = cohesionLevel(s);
  return `--max-sentence ${sx.max} --avg-sentence ${sx.avg} --max-clauses ${sx.clauses} --max-passives ${sx.passives}`
    + ` --min-overlap ${co.minOverlap} --min-connectives ${co.minConnectives}`
    + ` --max-overlap ${co.maxOverlap} --max-connectives ${co.maxConnectives}`;
};
const cohesionText = (co) => {
  const floor = co.minOverlap || co.minConnectives ? `重叠≥${co.minOverlap} 连接词≥${co.minConnectives}` : '';
  const ceil = co.maxOverlap !== 1 || co.maxConnectives !== 99 ? `重叠≤${co.maxOverlap} 连接词≤${co.maxConnectives}` : '';
  return [floor, ceil].filter(Boolean).join(' · ') || '无约束';
};
// shared difficulty view so status / confirm / pool can never disagree on the numbers
const difficultyOut = (s) => {
  const t = TIERS[s.difficulty.tier];
  const sx = syntaxLevel(s), co = cohesionLevel(s);
  const bg = clamp(s.difficulty.background ?? 1, MAX_BACKGROUND);
  return {
    tier: s.difficulty.tier,
    axes: {
      词汇: `tier ${s.difficulty.tier}/8 · ${t.label}`,
      句子: `syntax ${s.difficulty.syntax ?? SANE_SYNTAX}/4 · ${sx.label} · 句长≤${sx.max}/${sx.avg} 小句≤${sx.clauses} 被动≤${sx.passives}`,
      衔接: `cohesion ${s.difficulty.cohesion ?? SANE_COHESION}/3 · ${co.label} · ${cohesionText(co)}`,
      话题: `background ${bg}/2 · ${BACKGROUND_LADDER[bg]}`,
    },
    gateFlags: gateFlags(s),
  };
};
const GRADUATE_AT = 5; // graduation threshold; was a --graduate-at flag nothing ever passed (v1.19.0)
// v1.40.0 — ladder shrunk again at the learner's request, and graduation moved 6 → 5:
// 1/3/6/12/24h (was 6/6/12/24/36h at v1.31.0), no sixth encounter — the 5th exposure graduates.
// Shortest first-to-fifth span = 22h. The 5th rung (24h) still applies to a learner-specified
// word that goes past the threshold without being graduated yet.
const COOLDOWN_HOURS = { 1: 1, 2: 3, 3: 6, 4: 12, 5: 24 };
// Saturation valve — the learner's own deferred design (v1.13.0: "④ free-reading mode when
// inFlight > ~25"), finally switched on when real backlog data arrived: 35 in flight, 0 exits.
// Above this, pool stops offering fresh words so the queue can drain (inflow 1.5/passage was
// structurally outrunning graduation capacity ~0.7/passage).
const SATURATION_AT = 25;

// word -> [level, band]; only B1/B2 appear (A1/A2 are always free words, never banded)
const BANDS = new Map();
for (const line of readFileSync(join(SKILL_DIR, 'assets', 'word-bands.tsv'), 'utf8').split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const [w, lvl, band] = line.split('\t');
  if (w && lvl && band) BANDS.set(w.trim().toLowerCase(), [lvl.trim(), +band]);
}
function tierPool(tier) {
  const set = new Set();
  for (const [w, [lvl, band]] of BANDS) {
    if (lvl === 'B1' ? tier.b1.includes(band) : tier.b2.includes(band)) set.add(w);
  }
  return set;
}

// Pre-draft option menu (v1.18.0): the whole multi-axis / multi-rung choice surface, derived
// from the rung tables — no new state. The rung flagged `current` IS the default, and because
// the five axes live in state.json (auto-pushed to the private data repo) that default is
// literally the learner's last choice, carried across sessions and machines for free.
// The menu is a READOUT that can be acted on: the learner answers with an axis + rung and the
// agent runs `axes --<axis> <rung>`.
// v1.25.0: the menu now states, per axis, (a) which way difficulty runs — back then the index convention
// was NOT uniform (词汇/衔接/话题 were "bigger = harder" while 句子 inherited syntaxCalm's reverse
// direction), and without a marker a learner who learned one convention got the other axis backwards;
// (b) the copy-pasteable command; (c) lastUsed and whether this axis has drifted since the last draft,
// so the agent no longer has to diff by hand.
// v1.36.0: 句子 flipped, so all four axes now read "bigger number = harder". `direction` stays in the
// output anyway — it is what tells the learner *which* lever the axis actually pulls.
const lastUsedAxes = (s) => {
  const c = s.sessions.filter((x) => x.status === 'counted');
  for (let i = c.length - 1; i >= 0; i--) if (c[i].axes) return c[i].axes;
  return null;
};
const menuOut = (s, lastUsed = lastUsedAxes(s)) => {
  const cur = {
    tier: s.difficulty.tier,
    syntax: clamp(s.difficulty.syntax ?? SANE_SYNTAX, MAX_SYNTAX),
    cohesion: clamp(s.difficulty.cohesion ?? SANE_COHESION, MAX_COHESION),
    background: clamp(s.difficulty.background ?? 1, MAX_BACKGROUND),
  };
  const entry = (key, rungs, direction, extra = {}) => ({
    flag: `--${key}`,
    set: `axes --${key} <${rungs[0].value}–${rungs[rungs.length - 1].value}>`,
    direction,
    current: cur[key],
    lastUsed: lastUsed ? (lastUsed[key] ?? null) : null,
    driftedSinceLastDraft: lastUsed ? lastUsed[key] !== cur[key] : false,
    rungs: rungs.map((r) => ({ ...r, current: cur[key] === r.value })),
    ...extra,
  });
  return {
    词汇: entry('tier',
      Object.entries(TIERS).map(([n, t]) => ({ value: +n, label: t.label, detail: `${tierPool(t).size} 词` })),
      '数字越大越难（词池越大，允许出现的生僻词越多）',
      { note: '只能手动点菜（v1.22.0 起没有自动升档）。词池的过滤规则本身仍在脚本闸门内' }),
    句子: entry('syntax',
      SYNTAX_LADDER.map((r, i) => ({ value: i, label: r.label, detail: `句长≤${r.max}/${r.avg} 小句≤${r.clauses} 被动≤${r.passives}` })),
      '数字越大越难（句子越长、小句越多、被动句越多）'),
    衔接: entry('cohesion',
      COHESION_LADDER.map((r, i) => ({
        value: i, label: r.label,
        detail: r.minOverlap || r.minConnectives
          ? `重叠≥${r.minOverlap} 连接词≥${r.minConnectives}`
          : (r.maxOverlap !== 1 || r.maxConnectives !== 99
            ? `重叠≤${r.maxOverlap} 连接词≤${r.maxConnectives}`
            : '无约束'),
      })),
      '数字越大越难（衔接越少，越要自己补关系）'),
    话题: entry('background',
      BACKGROUND_LADDER.map((label, i) => ({ value: i, label })),
      '数字越大越难（话题越陌生）',
      { note: '无硬闸：靠选题兑现，脚本量不到。体感也只记录、不再调档（v1.22.0 删安全阀后此轴同样只由点菜改变）' }),
  };
};
// 不可调的固定红线。数值的**真源是 passage-check.mjs 的 LIMITS 默认值**——这里只是把它念出来，
// 好让 agent 不必去翻 SKILL.md。测试会断言两边的数字一致，防止面板又说谎（v1.24.0 的教训）。
const FIXED_LIMITS = {
  篇长: '250–350 词',
  目标词: '4–5 个，每个复现 ≥2 次，且每个至少加粗一次',
  超纲率: '≤4%（targets 才算；重逢词/白名单/已学词不占额度）',
  未申报超纲词: '0（任何超 A2 的词都必须是 target / 重逢词 / 白名单 / 已知词）',
  声明的重逢词: '必须至少出现一次',
};

// One-time migration of pre-v1.15.0 tier numbers (state.version < 2). Old tier 1 was
// "all B1" = new tier 3; old tiers 2/3 were the two ends of a non-monotone ladder and both
// map to the top of the new one. Applied on every read (status/pool never save), stamped by
// the next save — without it, a v1.14.0 state would be read as new-tier-1 and silently
// hand the learner the narrowest, easiest pool.
// 档位迁移（串联两代，读时应用、下次写入时落盘——status/pool 不写盘）。
// v1.14.0 三档 → v1.15.0 六档：旧 1 = 全部 B1 = 新 3；旧 2/3 是那条非单调阶梯的两端，都并入顶部。
const TIER_V1 = { 1: 3, 2: 6, 3: 6 };
// v1.15.0 六档 → v1.16.0 八档：按池子大小就近映射。锚点：旧 3（B1 全量 2178 词）≡ 新 4（2178 词）。
const TIER_V2 = { 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 };
const DEFAULT_AXES = { tier: 4, syntax: SANE_SYNTAX, cohesion: 2, background: 1 };
// v1.36.0 — 句子档索引翻转（新 = 4 − 旧）。难度包不变，只有编号反写，所以迁移必须同时改
// 当前档位和每篇的档位快照：快照不翻的话，`history` 会把旧档读成反方向的难度
// （旧 syntax 1 = 常规会被读成新的 1 = 冷静），台账就变成假账。
// 已归档的 $STATE/passages/*.md 里的 frontmatter **不改写**——那是当时展示过的成品记录，
// 且没有任何脚本回读它做判断；要按新编号重读旧篇，看 ledger 的 sessions 快照即可。
const flipSyntax = (v) => MAX_SYNTAX - v;
function load() {
  if (!existsSync(stateFile)) {
    if (cmd !== 'init') { console.error('no state at ' + stateFile + ' — run `ledger.mjs init` first'); process.exit(2); }
    return { version: 4, difficulty: { ...DEFAULT_AXES }, words: {}, sessions: [], interests: [] };
  }
  const s = JSON.parse(readFileSync(stateFile, 'utf8'));
  const v = s.version || 1;
  if (v < 2) { s.difficulty.tier = TIER_V1[s.difficulty.tier] || 3; s.version = 2; }
  if (v < 3) {
    s.difficulty.tier = TIER_V2[s.difficulty.tier] || DEFAULT_AXES.tier;
    // 旧 syntaxCalm 0/1/2/3 → 当时的 syntax 1/2/3/4（0 = 常规在两边都成立，只是索引整体后移一格；
    // v1.16.0 新增的 0 档是"放宽"，旧台账永远不会落在那里，所以不可能静默变难）。
    // 若台账还旧到 v1.36.0，下面的 v<4 分支会把它一并翻成 新 = 4 − 旧。
    s.difficulty.syntax = clamp((s.difficulty.syntaxCalm ?? 0) + 1, MAX_SYNTAX);
    delete s.difficulty.syntaxCalm;
    s.difficulty.cohesion = DEFAULT_AXES.cohesion;
    s.difficulty.background = DEFAULT_AXES.background;
    s.version = 3;
  }
  if (v < 4) {
    if (typeof s.difficulty.syntax === 'number') s.difficulty.syntax = flipSyntax(clamp(s.difficulty.syntax, MAX_SYNTAX));
    for (const sess of s.sessions || []) if (sess.axes && typeof sess.axes.syntax === 'number') sess.axes.syntax = flipSyntax(sess.axes.syntax);
    s.version = 4;
  }
  return s;
}
let lastSync = null;
function save(s) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(s, null, 2));
  if (!argv.includes('--no-sync')) {
    const r = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', 'state-git.mjs'), 'push', '--state-dir', stateDir], { encoding: 'utf8' });
    try { lastSync = JSON.parse(r.stdout.trim().split('\n').pop()); }
    catch { lastSync = { pushed: false, note: 'sync unavailable — commit is local, next session will retry' }; }
  }
}
function out(obj) { if (lastSync) obj.sync = lastSync; console.log(JSON.stringify(obj, null, 2)); }
function knownSet(s) {
  const set = new Set();
  if (existsSync(knownFile)) for (const l of readFileSync(knownFile, 'utf8').split('\n')) { const w = l.trim().toLowerCase(); if (w && !w.startsWith('#')) set.add(w); }
  if (existsSync(ankiFile)) for (const w of (JSON.parse(readFileSync(ankiFile, 'utf8')).words || [])) set.add(w.toLowerCase());
  for (const [w, e] of Object.entries(s.words)) if (e.status === 'known') set.add(w);
  return set;
}

if (cmd === 'init') {
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(join(stateDir, 'passages'), { recursive: true });
  if (!existsSync(knownFile)) writeFileSync(knownFile, '# graduated + explicitly known words, one per line\n');
  const s = load();
  if (!argv.includes('--force')) save(s); else writeFileSync(stateFile, JSON.stringify({ version: 4, difficulty: { ...DEFAULT_AXES }, words: {}, sessions: [], interests: [] }, null, 2));
  console.log('initialized ' + stateFile);
}

else if (cmd === 'pend') {
  const s = load();
  const meta = JSON.parse(readFileSync(arg('meta', null), 'utf8'));
  if (!meta.targets?.length) { console.error('meta.targets required'); process.exit(2); }
  let id = arg('id', null);
  if (!id) {
    const slug = (meta.topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    id = `${today}-${slug || 'session'}`;
    let n = 2;
    while (s.sessions.some((x) => x.id === id)) id = `${today}-${slug || 'session'}-${n++}`; // CJK topics slug to '' — keep same-day sessions unique
  }
  // v1.17.0: snapshot the axis settings this passage is drafted at. This is the record that
  // actually calibrates the scales — with it every ledger row reads `A -> feel`. The retired
  // predicted/requested profile recorded the agent's own guess about the passage instead, which
  // nothing consumed and which duplicated three cells the gate already measures directly.
  const axes = {
    tier: s.difficulty.tier,
    syntax: s.difficulty.syntax ?? SANE_SYNTAX,
    cohesion: s.difficulty.cohesion ?? SANE_COHESION,
    background: s.difficulty.background ?? 1,
  };
  s.sessions.push({ id, date: today, at: nowStamp(), topic: meta.topic || '', targets: meta.targets.map((w) => w.toLowerCase()), reunion: (meta.reunion || []).map((w) => w.toLowerCase()), status: 'pending', axes });
  for (const t of meta.targets.map((w) => w.toLowerCase())) {
    s.words[t] = s.words[t] || { exposures: 0, last: null, status: 'active' };
  }
  save(s);
  out({ session: id, status: 'pending', note: 'exposures NOT counted until `confirm`' });
}

else if (cmd === 'confirm') {
  const s = load();
  const id = arg('session', null);
  const sess = s.sessions.find((x) => x.id === id);
  if (!sess) { console.error(`no such session: ${id} — pending: ${s.sessions.filter((x) => x.status === 'pending').map((x) => x.id).join(', ') || '(none)'}`); process.exit(2); }
  if (sess.status === 'counted') { console.error('already counted'); process.exit(2); }
  sess.status = 'counted'; sess.readAt = nowStamp(); // v1.32.0: the reading log is hour-granular too
  const score = arg('score', null); // "3/3"
  const feel = arg('feel', null);   // flow|ok|wordy|dense|context|choppy —— 纯记录：v1.22.0 起没有任何一条会改动难度轴
  if (score) { const [a, b] = score.split('/').map(Number); sess.score = a / b; }
  if (feel) sess.feel = feel;
  // One exposure per word per day: a second same-day appearance is still read, but not
  // counted — otherwise a binge day fakes the spacing that acquisition needs.
  // v1.31.0: the same-day lock became a MINIMUM GAP IN HOURS (COOLDOWN_HOURS). Any gap shorter
  // than 24h is inert while "one exposure per calendar day" still stands, so the two rules were
  // merged: a word may only count again once its depth's hour-gap has elapsed.
  const tooSoon = [];
  for (const t of sess.targets) {
    const e = s.words[t] || { exposures: 0, last: null, status: 'active' };
    const need = COOLDOWN_HOURS[e.exposures] || COOLDOWN_HOURS[1];
    if (e.last && hoursSince(e.last) < need) {
      tooSoon.push(`${t} (还需 ${Math.ceil(need - hoursSince(e.last))}h)`);
      s.words[t] = e;
      continue;
    }
    e.exposures++; e.last = nowStamp(); e.status = 'active';
    s.words[t] = e;
  }
  // v1.22.0 — NO automatic difficulty routing. The skill's only job is to generate material that
  // meets the i+1 contract and to record what happened. Whether any axis goes up or down is the
  // learner's call alone, made explicitly through `axes`; the skill does not judge.
  // feel/score are therefore pure record — the outcome half of the A→feel ledger the learner
  // reads before deciding their own next move.
  //
  // Why the whole valve went, not just the `ok` decay that prompted the review:
  //   · every tap contradicted, or silently overrode, the learner's own locked rule that
  //     `ok` = i+1 equilibrium = hold everything. `ok` relaxing the syntax rung was the clearest
  //     case: a manual `--syntax 4` decayed back to 常规 across four ok passages, then one
  //     `dense` pushed it back up — an inescapable limit cycle.
  //   · it had never fired once: across all sessions the feel report was `ok` 16 times and never
  //     anything else, and no counted passage scored below 60%.
  //   · it was redundant with `axes`, which controls all four axes directly.
  // `streakGood` went with it — it existed only to count two consecutive `flow`s for promotion.
  save(s);
  const nominations = sess.targets.filter((t) => s.words[t].exposures >= GRADUATE_AT);
  out({
    session: id, ...difficultyOut(s),
    exposures: Object.fromEntries(sess.targets.map((t) => [t, `${s.words[t].exposures}/${GRADUATE_AT}`])),
    tooSoon: tooSoon.length ? tooSoon.map((w) => `${w} — not enough gap yet, no increment`) : undefined,
    graduationNominations: nominations.map((w) => `${w} — run: graduate --word ${w} (then optionally hand it to anki-flashcard for a permanent SRS card)`),
  });
}

else if (cmd === 'void') {
  const s = load();
  const sess = s.sessions.find((x) => x.id === arg('session', null));
  if (!sess) { console.error('no such session'); process.exit(2); }
  sess.status = 'void';
  let passageRemoved = false;
  try { unlinkSync(join(stateDir, 'passages', sess.id + '.md')); passageRemoved = true; } catch {}
  save(s); // unlink first: the deletion must ride THIS push, not a later write
  out({ session: sess.id, status: 'void', note: 'no exposures counted', passageRemoved });
}

else if (cmd === 'graduate') {
  const s = load();
  const w = arg('word', null)?.toLowerCase();
  if (!w) { console.error('--word required'); process.exit(2); }
  const e = s.words[w] || { exposures: 0, status: 'active' };
  e.status = 'known'; s.words[w] = e;
  appendFileSync(knownFile, w + '\n');
  save(s);
  out({ graduated: w, exposures: e.exposures, bridge: `optional: create a permanent flashcard via the anki-flashcard skill (dry-run → approve → confirmed)` });
}

else if (cmd === 'axes') {
  // 学习者直接点菜（v1.16.0）：手动设任一轴，不用等体感回路。这是协商的落点——
  // 点菜改的是真参数，不是某个记录用的数字。后续 confirm 仍会据此继续微调。
  const s = load();
  const AXES = { tier: [1, MAX_TIER], syntax: [0, MAX_SYNTAX], cohesion: [0, MAX_COHESION], background: [0, MAX_BACKGROUND] };
  const changed = {};
  for (const [k, [lo, hi]] of Object.entries(AXES)) {
    const v = arg(k, null);
    if (v === null) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) { console.error(`${k} must be an integer ${lo}-${hi}, got ${v}`); process.exit(2); }
    s.difficulty[k] = n; changed[k] = n;
  }
  if (!Object.keys(changed).length) { console.error('nothing to set — pass any of --tier/--syntax/--cohesion/--background'); process.exit(2); }
  save(s);
  out({ changed, ...difficultyOut(s), menu: menuOut(s) });
}

else if (cmd === 'interest') {
  const s = load();
  const add = arg('add', null);
  if (add) { if (!s.interests.includes(add)) s.interests.push(add); }
  if (arg('remove', null)) s.interests = s.interests.filter((x) => x !== arg('remove', null));
  save(s);
  out({ interests: s.interests });
}

else if (cmd === 'import-anki') {
  const src = arg('file', ankiFile);
  const data = JSON.parse(readFileSync(src, 'utf8'));
  mkdirSync(stateDir, { recursive: true });
  const s = load();
  const words = (data.words || []).map((w) => w.toLowerCase());
  for (const w of words) s.words[w] = s.words[w] || { exposures: 0, last: null, status: 'active' };
  writeFileSync(join(stateDir, 'anki-words.json'), JSON.stringify({ synced: today, deck: data.deck || null, words }, null, 2));
  save(s);
  out({ imported: words.length, words, note: 'these are KNOWN words: no annotation, no rate cost; prefer weaving them in as 重逢词' });
}

else if (cmd === 'pool') {
  const s = load();
  const known = knownSet(s);
  const tier = TIERS[s.difficulty.tier];
  const limit = +arg('limit', 12);
  // fresh = exposures 0 (never counted). Voided pendings leave 0/6 ghosts, so key off the
  // count, not off membership; Anki/graduated zeros are already caught by known.has
  const pool = [...tierPool(tier)]
    .filter((w) => !known.has(w) && (s.words[w]?.exposures || 0) === 0)
    .map((w) => [w, ...BANDS.get(w)]); // [word, level, band]
  // Saturation (v1.31.0): the learner's own deferred valve. While the queue is above the
  // threshold, fresh intake stops so the returnee slots can actually drain it — inflow was
  // structurally outrunning graduation capacity.
  const saturated = Object.values(s.words).filter((e) => e.status === 'active' && e.exposures >= 1 && e.exposures < GRADUATE_AT).length > SATURATION_AT;
  const q = saturated ? { mustReuse: [4, 5], fresh: [0, 0] } : { mustReuse: [3, 4], fresh: [1, 2] };
  const inFlight = Object.entries(s.words)
    .filter(([, e]) => e.status === 'active' && e.exposures >= 1 && e.exposures < GRADUATE_AT);
  // v1.31.0: eligibility is a minimum GAP IN HOURS, not a calendar-day comparison
  const eligible = inFlight.filter(([, e]) => hoursSince(e.last) >= (COOLDOWN_HOURS[e.exposures] || COOLDOWN_HOURS[1]));
  const mustReuse = eligible
    // v1.14.0 graduation-priority (learner-approved after the backlog math showed
    // 12 passages -> 0 graduations under fair rotation): closest-to-graduation first,
    // longest-unseen only breaks ties (so same-depth words still starve-proof).
    .sort((a, b) => (b[1].exposures - a[1].exposures) || (hoursSince(b[1].last) - hoursSince(a[1].last)))
    .slice(0, 8)
    .map(([w, e]) => `${w} (${e.exposures}/${GRADUATE_AT}, ${humanGap(hoursSince(e.last))} unseen)`);
  // deterministic rotation by date so the same day shows the same sample
  let seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = [];
  const pick = () => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * pool.length); };
  const seen = new Set();
  while (idx.length < Math.min(limit, pool.length) && seen.size < pool.length) { const i = pick(); if (!seen.has(i)) { seen.add(i); idx.push(i); } }
  // Anti-repeat exposure: the last 5 non-void sessions are the memory the agent must not
  // rely on goodwill for — pool is the mandatory pre-draft call, so the history lands there.
  const recent = s.sessions.filter((x) => x.status !== 'void').slice(-5).reverse()
    .map((x) => ({ session: x.id, date: x.date, at: x.at ?? null, readAt: x.readAt ?? null, topic: x.topic, targets: x.targets }));
  // A→feel history (v1.17.0, replaces the retired predicted/requested calibration feed): the
  // axis settings each recent passage was drafted at, next to how it actually landed. This is
  // the pairing that calibrates the scales. Legacy counted rows have axes:null — they predate the
  // snapshot and their predicted/requested fields are inert history, not a live signal.
  const history = s.sessions
    .filter((x) => x.status === 'counted')
    .slice(-8).reverse()
    .map((x) => ({ session: x.id, axes: x.axes ?? null, feel: x.feel ?? null, score: x.score ?? null }));
  console.log(JSON.stringify({
    ...difficultyOut(s),
    // v1.23.0: `status` was folded in here — its 8 fields overlapped this command's on 6 of them
    // (tier/axes/gateFlags/menu/inFlight/skillUpdate) and it added only pending + interests.
    pending: s.sessions.filter((x) => x.status === 'pending').map((p) => ({ id: p.id, topic: p.topic, date: p.date, at: p.at ?? null })),
    interests: s.interests,
    inFlight: inFlight.length,
    sleeping: inFlight.length - eligible.length,
    // v1.31.0 saturation valve: above SATURATION_AT the fresh quota is zero and the whole 4–5
    // goes to returnees. `quota` is machine-readable so the agent never has to re-derive it.
    saturated,
    quota: q,
    mustReuse,
    fresh: idx.map((i) => `${pool[i][0]} (${pool[i][1]}·b${pool[i][2]})`),
    recent,
    history,
    // The default the menu pre-selects is the live state, i.e. the learner's last choice; when
    // feedback-driven drift has since moved an axis, lastUsed shows what the last DRAFT actually
    // ran with, so a silent softening is visible instead of surprising.
    lastUsed: lastUsedAxes(s),
    menu: menuOut(s),
    // Non-adjustable red lines, so the panel is self-contained instead of sending the agent to
    // SKILL.md for the half of the difficulty contract that no axis controls.
    fixedLimits: FIXED_LIMITS,
    // v1.23.0: throttled only (24h). This used to force a fetch on every call because pool is the
    // last checkpoint before drafting — but that put an 8s-timeout network request on the drafting
    // path for a benefit (seeing the other machine's push one passage sooner) that a daily reading
    // routine does not need. The safety net stays; the latency goes.
    skillUpdate: skillUpdate(SKILL_DIR, stateDir),
    note: (saturated ? `⚠️ 队列 ${inFlight.length} > ${SATURATION_AT}：本篇**不收新词**，4–5 个名额全部给 mustReuse（饱和阀生效）。` : '')
      + `每篇目标词配额：${q.mustReuse[0]}–${q.mustReuse[1]} 个 mustReuse（距毕业最近者优先，主题装不下的可跳过，但整篇至少带 1 个）${q.fresh[1] ? ` + ${q.fresh[0]}–${q.fresh[1]} 个 fresh` : '，不收 fresh'}；八档统一总数 4–5，照旧过硬闸。`
      + '防重复（起草前必读 recent）：① 主题/场景与近 5 篇雷同必须换角度或换主题；② 目标词组合作为集合与任一篇 recent 完全相同必须重抽 fresh（部分重叠正常）。协商（起草前必做，v1.17.0 改为对着档位谈）：把本轮的轴向安排用一句人话讲给学习者（例：「今天词池到 tier 6、衔接调松、话题换新的」），他想改就直接 `axes --xxx` 落地——协商的对象是**真参数**，没有别的数字。难度**只**由学习者点菜改变（v1.22.0 起连安全阀也删了）：agent 不主动顶档、不因体感调档——体感与成绩**纯记录**，没有任何一条会动参数。校准（起草前必读 history）：每行是「这篇用的档位 → 学习者实际体感」——这是**给学习者自己看**的账：某轴调紧后仍报 ok，说明还有余量；一调紧就抱怨，说明边界在上一档。把它念给他听，让他自己决定下一步。',
  }, null, 2));
}

else if (cmd === 'archive') {
  // Step-6 archiving, fully scripted: the agent never hand-writes frontmatter, never copies
  // validatedBy from memory, and the sha256 anchor proves archive == what the gate approved.
  const s = load();
  const id = arg('session', null);
  const sess = s.sessions.find((x) => x.id === id);
  const rej = (why) => { console.error('ARCHIVE REJECTED: ' + why); process.exit(2); };
  if (!sess) rej(`no such session: ${id}`);
  if (sess.status !== 'pending') rej(`session ${id} is ${sess.status} — only pending sessions archive`);
  const passagePathA = arg('passage', null); const reportPath = arg('report', null);
  if (!passagePathA || !reportPath) rej('--passage and --report are required');
  let report; try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch (e) { rej('report unreadable: ' + e.message); }
  if (report.pass !== true) rej('report.pass is not true');
  if (!report.validatedBy) rej('report lacks validatedBy — rerun with a current passage-check');
  const body = readFileSync(passagePathA, 'utf8');
  if (createHash('sha256').update(body).digest('hex') !== report.passageSha256)
    rej('passage bytes changed after validation (sha256 mismatch) — re-check, then archive the approved file');
  const dest = join(stateDir, 'passages', id + '.md');
  if (existsSync(dest)) rej('append-only: ' + dest + ' already exists');
  const quiz = arg('quiz', null);
  const fm = [
    '---',
    `session: ${sess.id}`,
    `date: ${sess.date}`,
    ...(sess.at ? [`at: ${sess.at}`] : []),
    `topic: ${sess.topic}`,
    `targets: [${sess.targets.join(', ')}]`,
    `reunion: [${(sess.reunion || []).join(', ')}]`,
    `metrics: { words: ${report.words}, aboveLevelRate: ${report.aboveLevelRate}, maxSentence: ${report.maxSentence}, avgSentence: ${report.avgSentence}, maxClauses: ${report.maxClauses}, passives: ${report.passives}, contentOverlap: ${report.contentOverlap}, connectivesPerSentence: ${report.connectivesPerSentence} }`,
    // The five axis settings this passage was drafted at — read from the pend-time snapshot, so
    // the frontmatter provably matches the axes `pool` handed the draft, not whatever the live
    // state happens to be at archive time.
    `difficulty: { tier: ${(sess.axes || s.difficulty).tier}, syntax: ${(sess.axes || s.difficulty).syntax ?? SANE_SYNTAX}, cohesion: ${(sess.axes || s.difficulty).cohesion ?? SANE_COHESION}, background: ${(sess.axes || s.difficulty).background ?? 1} }`,
    ...(quiz ? [`quizAnswers: [${quiz.split(',').map((x) => x.trim()).join(', ')}]`] : []),
    `validatedBy: ${report.validatedBy}`,
    '---',
    '',
  ].join('\n');
  mkdirSync(join(stateDir, 'passages'), { recursive: true });
  writeFileSync(dest, fm + body);
  // archive never touches state.json (no save()): the passage file rides its own push.
  const r = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', 'state-git.mjs'), 'push', '--message', `passage ${id}`, '--state-dir', stateDir], { encoding: 'utf8' });
  let sync = null; try { sync = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { sync = { pushed: false, note: 'sync unavailable' }; }
  console.log(JSON.stringify({ archived: id, path: dest, validatedBy: report.validatedBy, sync }, null, 2));
}

else {
  console.log('commands: init | pend --meta f.json | confirm --session id [--score 3/3 --feel flow|ok|wordy|dense|context|choppy] | void --session id | graduate --word w | import-anki [--file j] | pool [--limit n] | axes [--tier n --syntax n --cohesion n --background n] | interest [--add x|--remove x] | archive --session id --passage f.md --report r.json [--quiz "B,A,C"]');
  process.exit(cmd ? 2 : 0);
}

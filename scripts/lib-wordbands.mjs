// v1.47.0 — 词带与档位阶梯的唯一真源：ledger（选词/菜单/闸门串）与 passage-check（硬闸）
// 都从这里读，两边不可能再对同一个词带给出不同答案（v1.24.0「面板又说谎」教训的延伸）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// word -> [level, band]; only B1/B2 appear (A1/A2 are always free words, never banded)
export const BANDS = new Map();
for (const line of readFileSync(join(SKILL_DIR, 'assets', 'word-bands.tsv'), 'utf8').split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const [w, lvl, band] = line.split('\t');
  if (w && lvl && band) BANDS.set(w.trim().toLowerCase(), [lvl.trim(), +band]);
}

// 词汇 8 档单调阶梯（v1.16.0）：B1/B2 各切四段，逐档并入，档越高允许出现的难词越多。
export const TIERS = {
  1: { b1: [1], b2: [], label: 'B1 易段' },
  2: { b1: [1, 2], b2: [], label: 'B1 易+中易' },
  3: { b1: [1, 2, 3], b2: [], label: 'B1 易+中易+中难' },
  4: { b1: [1, 2, 3, 4], b2: [], label: 'B1 全量' },
  5: { b1: [1, 2, 3, 4], b2: [1], label: 'B1 全量 + B2 易段' },
  6: { b1: [1, 2, 3, 4], b2: [1, 2], label: 'B1 全量 + B2 易+中易' },
  7: { b1: [1, 2, 3, 4], b2: [1, 2, 3], label: 'B1 全量 + B2 易+中易+中难' },
  8: { b1: [1, 2, 3, 4], b2: [1, 2, 3, 4], label: 'B1+B2 全量' },
};
export const MAX_TIER = 8;

export function tierPool(tier) {
  const set = new Set();
  for (const [w, [lvl, band]] of BANDS) {
    if (lvl === 'B1' ? tier.b1.includes(band) : tier.b2.includes(band)) set.add(w);
  }
  return set;
}

// 底词轴（v1.47.0，学习者 2026-10-05 拍板）：目标词之外那些「不申报、不注释、不记账」的
// 背景词的难度上限。档 1 = A2 底（v1.46.0 及之前的唯一行为）；档 k≥2 = 允许未申报背景词
// 出现在词汇 tier(k−1) 的同一个带里。**v1.48.0：不设数量上限** —— 档位只回答「从哪个带里挑」，
// 挑多少由写稿方自己决定，背景超纲率仍算出来写进报告，但**不再当判定条件**。
// 理由：率闸是拍出来的数（线性到 4% 没有任何实测依据），而「这篇到底混了多少难词」是
// 学习者读完报体感、由他自己调档的信号 —— 让机器替他封顶，等于把难度控制权重又拿回去一半。
// B2 全量带刻意不做背景——那是目标词的领地。
export const BASE_LADDER = [
  { value: 1, label: 'A2 底', band: null },
  { value: 2, label: TIERS[1].label, band: 1 },
  { value: 3, label: TIERS[2].label, band: 2 },
  { value: 4, label: TIERS[3].label, band: 3 },
  { value: 5, label: TIERS[4].label, band: 4 },
  { value: 6, label: TIERS[5].label, band: 5 },
  { value: 7, label: TIERS[6].label, band: 6 },
  { value: 8, label: TIERS[7].label, band: 7 },
];
export const MAX_BASEWORD = BASE_LADDER.length;
export const baseLevel = (v) => BASE_LADDER[Math.min(Math.max(v ?? 1, 1), MAX_BASEWORD) - 1];

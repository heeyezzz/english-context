#!/usr/bin/env node
// Hard validation for generated reading passages (english-context skill).
// Usage: node passage-check.mjs --passage file.md --meta file.json [--state-dir DIR]
// Exit 0 = PASS, 1 = FAIL. Prints a metrics report either way.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SELF_PATH = fileURLToPath(import.meta.url);

// Machine-readable validator signature: version can lie (see the 1.4.2 sed no-op), a blob hash
// cannot. `ledger.mjs archive` copies `validatedBy` from this report into the frontmatter (step 6).
// Scope note (Win 2026-09-23): the hash covers this file's source only — an assets/ change
// (word list, irregular forms) shifts the verdict invisibly to the hash; that layer is policed
// by the version field plus ship.mjs's rule-layer lint, not by the sha256.
function validatorSignature() {
  const version = (readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8').match(/^version:\s*(\S+)/m) || [])[1] || 'unknown';
  let hash = 'unhashed';
  try { hash = createHash('sha256').update(readFileSync(SELF_PATH)).digest('hex').slice(0, 8); } catch {}
  return `${version} (sha256:${hash})`;
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}
const has = (name) => process.argv.includes('--' + name);

const passagePath = arg('passage', null);
const metaPath = arg('meta', null);
if (!passagePath || !metaPath) {
  console.error('required: --passage <file> --meta <file.json>{"targets":[],"reunion":[],"names":[]}');
  process.exit(2);
}
const stateDir = arg('state-dir', join(homedir(), '.english-context'));

const LIMITS = {
  minWords: +arg('min-words', 250),
  maxWords: +arg('max-words', 350),
  maxSentence: +arg('max-sentence', 20),
  avgSentence: +arg('avg-sentence', 12),
  maxRate: +arg('max-rate', 4.0),          // % of running words that are above-level (targets)
  minTargets: +arg('min-targets', 4),
  maxTargets: +arg('max-targets', 5),
  minTargetHits: +arg('min-target-hits', 2), // each target must occur >= this many times
  // v1.16.0 syntactic/discourse gates. Defaults are deliberately NON-BINDING so that a caller
  // that passes no flags behaves exactly as before; ledger.mjs emits the exact flag string
  // (`gateFlags`) for the current rung, and SKILL.md requires copying it verbatim.
  maxClauses: +arg('max-clauses', 99),       // clauses per sentence (subordinators+relatives) -> T-unit density
  maxPassives: +arg('max-passives', 99),     // passive constructions in the whole passage
  minOverlap: +arg('min-overlap', 0),        // adjacent-sentence content-word overlap, 0-1 (cohesion floor)
  minConnectives: +arg('min-connectives', 0), // discourse connectives per sentence (deep-cohesion floor)
  // ...and the hard-end of the same axis: deliberately FEWER explicit ties, so the reader has to
  // build the relations. Defaults are non-binding ceilings (1 / 99) so an unflagged call is inert.
  maxOverlap: +arg('max-overlap', 1),
  maxConnectives: +arg('max-connectives', 99),
};

// ---------- vocabulary ----------
function loadLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n')
    .map((l) => l.split('#')[0].trim().toLowerCase())
    .filter(Boolean);
}
const levelOf = new Map();
for (const line of readFileSync(join(SKILL_DIR, 'assets', 'cefr-j-words.tsv'), 'utf8').split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const [w, lvl] = line.split('\t');
  if (w && lvl) levelOf.set(w.trim().toLowerCase(), lvl.trim());
}
const irregular = new Set(loadLines(join(SKILL_DIR, 'assets', 'irregular-forms.txt')));
const whitelist = new Set(loadLines(join(SKILL_DIR, 'assets', 'allow-extra.txt')));
const knownFile = join(stateDir, 'known-words.txt');
const known = new Set(existsSync(knownFile) ? loadLines(knownFile) : []);
const ankiFile = join(stateDir, 'anki-words.json');
if (existsSync(ankiFile)) for (const w of JSON.parse(readFileSync(ankiFile, 'utf8')).words || []) known.add(w.toLowerCase());

// ---------- text ----------
const raw = readFileSync(passagePath, 'utf8');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const targets = (meta.targets || []).map((w) => w.toLowerCase());
const reunion = new Set((meta.reunion || []).map((w) => w.toLowerCase()));
const names = new Set((meta.names || []).map((w) => w.toLowerCase()));
const DIMS = ['vocab', 'syntax', 'discourse', 'background'];

// strip markdown structure but keep bold spans for the highlight check
const boldSpans = [...raw.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].toLowerCase());
const prose = (raw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l) && !/^\s*\|/.test(l) && !/^\s*$/.test(l) && !/^\s*[-—=]+\s*$/.test(l))
  .join('\n')
  .replace(/\*\*/g, ''))
  .replace(/([.?!])([”"'])+/g, '$2$1'); // "said Lee." -> quote comes after the full stop

const ABBR = /\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|etc|No|a\.m|p\.m)\b\./gi;
const protectedText = prose.replace(ABBR, '$1<DOT>');
const sentences = protectedText
  .replace(/[”"]+(?=[\s.?!])/g, '')
  .split(/[.?!]+(?=\s|$)/)
  .map((s) => s.replace(/<DOT>/g, '.'))
  .map((s) => s.trim())
  .filter(Boolean);

const WORD_RE = /[A-Za-z][A-Za-z'’-]*|[0-9][0-9:.,]*/g;
// single letters are quiz option markers (A) B) C)), not vocabulary — except a/i, which are words
const tokens = (prose.match(WORD_RE) || []).filter((t) => t.length > 1 || /^[aAiI]$/.test(t));
const totalWords = tokens.length;

// ---------- lemma expansion ----------
const SUFFIX_RULES = [
  (w) => w,
  (w) => (w.endsWith('ies') && w.length > 4 ? w.slice(0, -3) + 'y' : null),
  (w) => (w.endsWith('ves') && w.length > 4 ? w.slice(0, -3) + 'f' : null), // shelves->shelf, leaves->leaf
  (w) => (w.endsWith('ves') && w.length > 5 ? w.slice(0, -3) + 'fe' : null), // knives->knife
  (w) => (w.endsWith('oes') && w.length > 4 ? w.slice(0, -2) : null),
  (w) => (w.endsWith('s') && w.length > 4 && /[cs]ion$|[sz]$/.test(w.slice(0, -1)) ? w.slice(0, -1) : null), // concessions->concession
  (w) => (w.endsWith('ed') && w.length > 4 && w.endsWith('ked') ? w.slice(0, -2) : null), // asked -> ask
  (w) => (w.endsWith('es') && w.length > 3 && /[sxzo]$/.test(w.slice(0, -2)) ? w.slice(0, -2) : null), // goes -> go (guard was >4: exactly the 4-letter case it exists for)
  (w) => (w.endsWith('es') && w.length > 4 ? w.slice(0, -2) : null),
  (w) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : null),
  (w) => (w.endsWith('ed') && w.length > 4 ? w.slice(0, -2) : null),
  (w) => (w.endsWith('ed') && w.length > 3 ? w.slice(0, -1) : null),
  (w) => (w.endsWith('e') && w.length > 3 ? w.slice(0, -1) : null),
  (w) => (w.endsWith('ing') && w.length > 5 ? w.slice(0, -3) : null),
  (w) => (w.endsWith('ing') && w.length > 5 ? w.slice(0, -3) + 'e' : null),
  (w) => { // running -> run (dropped doubled consonant)
    const b = w.endsWith('ing') && w.length > 5 ? w.slice(0, -3) : null;
    if (b && /(b|d|g|l|m|n|p|r|t|v|z)(\1)$/.test(b)) return b.slice(0, -1);
    return null;
  },
  (w) => (w.endsWith('er') && w.length > 4 ? w.slice(0, -2) : null),
  (w) => (w.endsWith('er') && w.length > 4 ? w.slice(0, -1) : null),
  (w) => (w.endsWith('ers') && w.length > 5 ? w.slice(0, -3) : null),
  (w) => (w.endsWith('est') && w.length > 5 ? w.slice(0, -3) : null),
  (w) => (w === 'cannot' || (w.endsWith('not') && w.length > 5) ? w.slice(0, -3) : null), // cannot -> can
];

const NUMERALS = new Set(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand',
  'million', 'billion', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']);

// A transparently-derived form (moving = move + ing) is as known as its simplest A1/A2 base,
// even when the list carries its own higher entry; take the best hit across candidates.
const RANK = { A1: 1, A2: 2, B1: 3, B2: 4 };

function classify(surface) {
  const w = surface.toLowerCase().replace(/['’].*$/, '');
  if (!w || names.has(w)) return { kind: 'name', level: null };
  if (w.includes('-') && w.split('-').every((p) => NUMERALS.has(p) || levelOf.has(p))) return { kind: 'in', level: 'A1?' };
  const candidates = SUFFIX_RULES.map((f) => f(w)).filter(Boolean);
  let level = null;
  for (const c of candidates) {
    if (levelOf.has(c)) {
      const l = levelOf.get(c);
      if (!level || RANK[l] < RANK[level]) level = l;
      if (level === 'A1') break;
    }
  }
  // any surface form may normalize to a known/whitelist/irregular base ("allocates" -> "allocate"
  // when allocate lives only in the Anki list, not in CEFR): match across all candidates, not just w/base
  const anyForm = (set) => set.has(w) || candidates.some((c) => set.has(c));
  if (level && (level === 'A1' || level === 'A2')) return { kind: 'in', level };
  if (anyForm(irregular)) return { kind: 'in', level: 'A2?' };
  if (anyForm(whitelist)) return { kind: 'whitelisted', level };
  if (anyForm(known)) return { kind: 'known', level };
  return { kind: 'above', level: level || 'OFF' };
}

// bucket above/in occurrences by base for hit counting
const aboveBuckets = new Map(); // base -> {count, surfaces:Set, level}
const targetHits = new Map(); // target -> count
for (const m of targets) targetHits.set(m, 0);

for (const t of tokens) {
  if (!/[A-Za-z]/.test(t)) continue;
  const c = classify(t);
  if (c.kind === 'above') {
    const key = t.toLowerCase().replace(/['’].*$/, '');
    const norm = candidates0(key);
    const prev = aboveBuckets.get(norm) || { count: 0, surfaces: new Set(), level: c.level };
    prev.count++; prev.surfaces.add(key);
    aboveBuckets.set(norm, prev);
  }
  // count target hits via same normalization
  const norm = candidates0(t.toLowerCase().replace(/['’].*$/, ''));
  if (targetHits.has(norm)) targetHits.set(norm, targetHits.get(norm) + 1);
}

function candidates0(w) {
  if (levelOf.has(w) || known.has(w) || whitelist.has(w)) return w;
  if (targets.includes(w)) return w;
  for (const f of SUFFIX_RULES) {
    const b = f(w);
    if (!b) continue;
    if (levelOf.has(b) || known.has(b) || whitelist.has(b)) return b;
    if (targets.includes(b)) return b;
  }
  // update/updates: base of surface when surface itself is a target
  if (targets.includes(w)) return w;
  for (const t of targets) if (w === t || w.startsWith(t) || t.startsWith(w)) return t;
  for (const f of SUFFIX_RULES) {
    const b = f(w);
    if (b) for (const t of targets) if (b === t || b.startsWith(t) || t.startsWith(b)) return t;
  }
  return w;
}

// ---------- checks ----------
const fail = [];
const warn = [];
function isReunionWord(base, b) {
  if (reunion.has(base)) return true;
  for (const s of b.surfaces) if (reunion.has(s)) return true;
  return false;
}

const sentLens = sentences.map((s) => (s.match(WORD_RE) || []).length);
const avg = sentLens.length ? sentLens.reduce((a, b) => a + b, 0) / sentLens.length : 0;
// above-level rate counts only true NEW words (targets); reunion words are known to the
// reader (Anki/graduated), so they cost no coverage — same rule the 98%-research implies.
const aboveTokens = [...aboveBuckets.entries()]
  .filter(([base, b]) => !isReunionWord(base, b))
  .reduce((a, [, b]) => a + b.count, 0);
const rate = totalWords ? (aboveTokens / totalWords) * 100 : 0;

// ---------- v1.16.0 syntactic / discourse metrics (parser-free approximations) ----------
// Clause density counts subordinators + relative pronouns — that is the strongest syntactic
// predictor in the research (T-unit length). Passives are BE + participle. Cohesion is
// adjacent-sentence content-word overlap (the core of Coh-Metrix's L2 readability index).
// Connectives come from a fixed list. These are heuristics ("that" is both a relativizer and a
// demonstrative), so the caps in SYNTAX_LADDER / COHESION_LADDER are set from the measured
// spread of the learner's own 13 archived passages, not from a theoretical ideal.
const SUBORDINATORS = /\b(although|though|because|since|while|whereas|unless|until|whenever|when|wherever|where|if|after|before|that|which|who|whom|whose)\b/gi;
const CONNECTIVES = /\b(however|therefore|moreover|furthermore|nevertheless|nonetheless|consequently|meanwhile|instead|otherwise|thus|hence|besides|firstly|secondly|thirdly|finally|then|next|later|still|also|because|although|though|while|when|if|since|but|and|or|yet|so)\b/gi;
const STOPWORDS = new Set(('a an the and or but so yet nor for of in on at to from by with as is are was were be been being am '
  + 'do does did have has had will would can could may might must shall should this that these those it its they them '
  + 'their he she his her him you your we our us i me my not no if then than there here when where while because '
  + 'although though who whom whose which what how all any both each few more most other some such only own same too '
  + 'very just also even still').split(/\s+/));
const clauseCounts = sentences.map((s) => 1 + (s.match(SUBORDINATORS) || []).length);
const maxClauses = clauseCounts.length ? Math.max(...clauseCounts) : 0;
let passiveCount = 0;
for (const s of sentences) {
  const re = /\b(is|are|was|were|be|been|being|am)\s+([a-z][a-z'-]*)\b/gi;
  let m;
  while ((m = re.exec(s))) {
    const p = m[2].toLowerCase();
    if (/(ed|en)$/.test(p) || irregular.has(p)) passiveCount++;
  }
}
const contentSets = sentences.map((s) => new Set(
  (s.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((w) => !STOPWORDS.has(w) && w.length > 2)));
let overlapSum = 0, overlapN = 0;
for (let i = 1; i < contentSets.length; i++) {
  const cur = contentSets[i], prev = contentSets[i - 1];
  if (!cur.size) continue;
  let hit = 0;
  for (const w of cur) if (prev.has(w)) hit++;
  overlapSum += hit / cur.size; overlapN++;
}
const overlap = overlapN ? overlapSum / overlapN : 0;
const connectivesPerSentence = sentences.length ? (prose.match(CONNECTIVES) || []).length / sentences.length : 0;

if (targets.length < LIMITS.minTargets || targets.length > LIMITS.maxTargets)
  fail.push(`targets count ${targets.length} outside ${LIMITS.minTargets}–${LIMITS.maxTargets}`);
if (totalWords < LIMITS.minWords || totalWords > LIMITS.maxWords)
  fail.push(`passage length ${totalWords} words outside ${LIMITS.minWords}–${LIMITS.maxWords}`);
if (Math.max(0, ...sentLens) > LIMITS.maxSentence)
  fail.push(`longest sentence ${Math.max(...sentLens)} > ${LIMITS.maxSentence} words`);
if (avg > LIMITS.avgSentence)
  fail.push(`avg sentence ${avg.toFixed(1)} > ${LIMITS.avgSentence}`);
if (rate > LIMITS.maxRate)
  fail.push(`above-level token rate ${rate.toFixed(1)}% > ${LIMITS.maxRate}%`);
if (maxClauses > LIMITS.maxClauses)
  fail.push(`longest clause run ${maxClauses} > ${LIMITS.maxClauses} clauses in one sentence`);
if (passiveCount > LIMITS.maxPassives)
  fail.push(`passive constructions ${passiveCount} > ${LIMITS.maxPassives}`);
if (overlap < LIMITS.minOverlap)
  fail.push(`adjacent-sentence content overlap ${overlap.toFixed(2)} < ${LIMITS.minOverlap} (cohesion floor)`);
if (connectivesPerSentence < LIMITS.minConnectives)
  fail.push(`connectives per sentence ${connectivesPerSentence.toFixed(2)} < ${LIMITS.minConnectives} (deep-cohesion floor)`);
if (overlap > LIMITS.maxOverlap)
  fail.push(`adjacent-sentence content overlap ${overlap.toFixed(2)} > ${LIMITS.maxOverlap} (too explicit for this rung)`);
if (connectivesPerSentence > LIMITS.maxConnectives)
  fail.push(`connectives per sentence ${connectivesPerSentence.toFixed(2)} > ${LIMITS.maxConnectives} (too explicit for this rung)`);

const undeclared = [];
for (const [base, b] of aboveBuckets) {
  const isTarget = targets.includes(base) || [...targetHits.keys()].some((t) => targetHits.get(t) > 0 && (base === t || base.startsWith(t) || t.startsWith(base)));
  const b0 = [...b.surfaces][0];
  const hitByTarget = targets.some((t) => targetHits.get(t) > 0 && candidates0(b0) === candidates0(t));
  if (!isTarget && !hitByTarget && !reunion.has(base)) undeclared.push(`${b0} (${b.level}, x${b.count})`);
}
if (undeclared.length) fail.push(`undeclared above-level words: ${undeclared.join(', ')}`);

for (const t of targets) {
  const hits = targetHits.get(t) || 0;
  if (hits < LIMITS.minTargetHits) fail.push(`target "${t}" occurs ${hits}x, needs >= ${LIMITS.minTargetHits}`);
  const bolded = boldSpans.some((span) => span.includes(t));
  if (!bolded) warn.push(`target "${t}" never appears inside **bold** (rule: highlight targets)`);
}
const reunionUsed = [...reunion].filter((r) => candidates0(r) && tokens.some((t) => candidates0(t.toLowerCase().replace(/['’].*$/, '')) === candidates0(r)));
if (reunion.size && !reunionUsed.length) warn.push('declared reunion words never appeared in prose');

// predicted load profile (v1.13.0): the agent's pre-registered self-assessment against
// references/difficulty-rubric.md. Script checks SHAPE only — the score is judgment, not measurement.
// requested (v1.15.0) is the profile the learner actually asked for at the pre-draft
// negotiation; optional, but if present it must be well-formed so the two calibration
// loops (requested→feel, predicted→requested) compare like with like.
const shapeCheck = (obj, field, required) => {
  if (!obj || typeof obj !== 'object') {
    if (required) fail.push(`meta.${field} required: {"vocab":1-3,"syntax":1-3,"discourse":1-3,"background":1-3} — see references/difficulty-rubric.md`);
    return;
  }
  for (const d of DIMS) {
    if (!Number.isInteger(obj[d]) || obj[d] < 1 || obj[d] > 3)
      fail.push(`meta.${field}.${d} must be an integer 1-3, got ${JSON.stringify(obj[d])}`);
  }
};
shapeCheck(meta.predicted, 'predicted', true);
shapeCheck(meta.requested, 'requested', false);

// ---------- report ----------
const report = {
  pass: fail.length === 0,
  words: totalWords,
  sentences: sentLens.length,
  avgSentence: +avg.toFixed(1),
  maxSentence: Math.max(0, ...sentLens),
  maxClauses,
  passives: passiveCount,
  contentOverlap: +overlap.toFixed(3),
  connectivesPerSentence: +connectivesPerSentence.toFixed(2),
  aboveLevelTokens: aboveTokens,
  aboveLevelRate: +rate.toFixed(1) + '%',
  targets: Object.fromEntries(targetHits),
  reunionUsed,
  undeclared,
  validatedBy: validatorSignature(),
  // archive-time anchor: ledger.mjs archive refuses to file a passage whose bytes changed
  // after validation (sha256 of the raw file as sent to this gate).
  passageSha256: createHash('sha256').update(raw).digest('hex'),
  fail, warn,
};
const reportJson = JSON.stringify(report, null, 2);
if (arg('report', null)) { try { writeFileSync(arg('report'), reportJson); } catch (e) { console.error('--report write failed: ' + e.message); } }
console.log(reportJson);
process.exit(report.pass ? 0 : 1);

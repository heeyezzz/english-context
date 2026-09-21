#!/usr/bin/env node
// Exposure ledger + dynamic difficulty for english-context.
// State lives in ~/.english-context/ (override with --state-dir or EC_STATE_DIR).
// Commands: init | status | pend | confirm | graduate | import-anki | pool | interest

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv;
const cmd = argv[2];
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const stateDir = arg('state-dir', process.env.EC_STATE_DIR || join(homedir(), '.english-context'));
const stateFile = join(stateDir, 'state.json');
const knownFile = join(stateDir, 'known-words.txt');
const ankiFile = join(stateDir, 'anki-words.json');
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD, not UTC

const TIERS = {
  1: { pool: ['B1'], targets: [4, 5], label: 'A2→B1' },
  2: { pool: ['B1', 'B2'], targets: [5, 6], label: 'B1' },
  3: { pool: ['B2'], targets: [6, 7], label: 'B1→B2' },
};
const GRADUATE_AT = +arg('graduate-at', 6);

function load() {
  if (!existsSync(stateFile)) {
    if (cmd !== 'init') { console.error('no state at ' + stateFile + ' — run `ledger.mjs init` first'); process.exit(2); }
    return { version: 1, difficulty: { tier: 1, streakGood: 0 }, words: {}, sessions: [], interests: [] };
  }
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}
function save(s) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(s, null, 2));
}
function knownSet(s) {
  const set = new Set();
  if (existsSync(knownFile)) for (const l of readFileSync(knownFile, 'utf8').split('\n')) { const w = l.trim().toLowerCase(); if (w && !w.startsWith('#')) set.add(w); }
  if (existsSync(ankiFile)) for (const w of (JSON.parse(readFileSync(ankiFile, 'utf8')).words || [])) set.add(w.toLowerCase());
  for (const [w, e] of Object.entries(s.words)) if (e.status === 'known') set.add(w);
  return set;
}

if (cmd === 'init') {
  mkdirSync(stateDir, { recursive: true });
  if (!existsSync(knownFile)) writeFileSync(knownFile, '# graduated + explicitly known words, one per line\n');
  const s = load();
  if (!argv.includes('--force')) save(s); else writeFileSync(stateFile, JSON.stringify({ version: 1, difficulty: { tier: 1, streakGood: 0 }, words: {}, sessions: [], interests: [] }, null, 2));
  console.log('initialized ' + stateFile);
}

else if (cmd === 'status') {
  const s = load();
  const tier = TIERS[s.difficulty.tier];
  const pending = s.sessions.filter((x) => x.status === 'pending');
  const nominations = Object.entries(s.words).filter(([, e]) => e.status === 'active' && e.exposures >= GRADUATE_AT);
  console.log(JSON.stringify({
    tier: s.difficulty.tier, tierLabel: tier.label, targetsRange: tier.targets, streakGood: s.difficulty.streakGood,
    sessions: { total: s.sessions.length, counted: s.sessions.filter((x) => x.status === 'counted').length, pending: pending.map((p) => ({ id: p.id, topic: p.topic, date: p.date })) },
    activeWords: Object.entries(s.words).filter(([, e]) => e.status === 'active').map(([w, e]) => `${w}:${e.exposures}/${GRADUATE_AT}`).join(' '),
    graduationNominations: nominations.map(([w, e]) => `${w} (${e.exposures} exposures)`),
    interests: s.interests,
  }, null, 2));
}

else if (cmd === 'pend') {
  const s = load();
  const meta = JSON.parse(readFileSync(arg('meta', null), 'utf8'));
  if (!meta.targets?.length) { console.error('meta.targets required'); process.exit(2); }
  const id = arg('id', `${today}-${(meta.topic || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  s.sessions.push({ id, date: today, topic: meta.topic || '', targets: meta.targets.map((w) => w.toLowerCase()), reunion: (meta.reunion || []).map((w) => w.toLowerCase()), status: 'pending', words: meta.words || null });
  for (const t of meta.targets.map((w) => w.toLowerCase())) {
    s.words[t] = s.words[t] || { exposures: 0, first: null, last: null, status: 'active', source: 'pool' };
  }
  save(s);
  console.log(JSON.stringify({ session: id, status: 'pending', note: 'exposures NOT counted until `confirm`' }));
}

else if (cmd === 'confirm') {
  const s = load();
  const id = arg('session', null);
  const sess = s.sessions.find((x) => x.id === id);
  if (!sess) { console.error(`no such session: ${id} — pending: ${s.sessions.filter((x) => x.status === 'pending').map((x) => x.id).join(', ') || '(none)'}`); process.exit(2); }
  if (sess.status === 'counted') { console.error('already counted'); process.exit(2); }
  sess.status = 'counted'; sess.date_confirmed = today;
  const score = arg('score', null); // "3/3"
  const feel = arg('feel', null);   // easy|ok|hard
  if (score) { const [a, b] = score.split('/').map(Number); sess.score = a / b; }
  if (feel) sess.feel = feel;
  for (const t of sess.targets) {
    const e = s.words[t] || { exposures: 0, first: today, status: 'active', source: 'pool' };
    if (!e.first) e.first = today;
    e.exposures++; e.last = today; e.status = 'active';
    s.words[t] = e;
  }
  // dynamic difficulty: up after 2 good sessions, down on hard feedback
  const good = (sess.score == null || sess.score >= 0.8) && feel !== 'hard';
  if (feel === 'hard' || (sess.score != null && sess.score < 0.6)) {
    s.difficulty.streakGood = 0;
    if (s.difficulty.tier > 1) s.difficulty.tier--;
  } else if (good) {
    s.difficulty.streakGood++;
    if (s.difficulty.streakGood >= 2 && s.difficulty.tier < 3) { s.difficulty.tier++; s.difficulty.streakGood = 0; }
  }
  save(s);
  const nominations = sess.targets.filter((t) => s.words[t].exposures >= GRADUATE_AT);
  console.log(JSON.stringify({
    session: id, tier: s.difficulty.tier, tierLabel: TIERS[s.difficulty.tier].label,
    exposures: Object.fromEntries(sess.targets.map((t) => [t, `${s.words[t].exposures}/${GRADUATE_AT}`])),
    graduationNominations: nominations.map((w) => `${w} — run: graduate --word ${w} (then optionally hand it to anki-flashcard for a permanent SRS card)`),
  }, null, 2));
}

else if (cmd === 'void') {
  const s = load();
  const sess = s.sessions.find((x) => x.id === arg('session', null));
  if (!sess) { console.error('no such session'); process.exit(2); }
  sess.status = 'void'; save(s);
  console.log(JSON.stringify({ session: sess.id, status: 'void', note: 'no exposures counted' }));
}

else if (cmd === 'graduate') {
  const s = load();
  const w = arg('word', null)?.toLowerCase();
  if (!w) { console.error('--word required'); process.exit(2); }
  const e = s.words[w] || { exposures: 0, status: 'active', source: 'pool' };
  e.status = 'known'; s.words[w] = e;
  appendFileSync(knownFile, w + '\n');
  save(s);
  console.log(JSON.stringify({ graduated: w, exposures: e.exposures, bridge: `optional: create a permanent flashcard via the anki-flashcard skill (dry-run → approve → confirmed)` }));
}

else if (cmd === 'interest') {
  const s = load();
  const add = arg('add', null);
  if (add) { if (!s.interests.includes(add)) s.interests.push(add); }
  if (arg('remove', null)) s.interests = s.interests.filter((x) => x !== arg('remove', null));
  save(s);
  console.log(JSON.stringify({ interests: s.interests }));
}

else if (cmd === 'import-anki') {
  const src = arg('file', ankiFile);
  const data = JSON.parse(readFileSync(src, 'utf8'));
  mkdirSync(stateDir, { recursive: true });
  const s = load();
  const words = (data.words || []).map((w) => w.toLowerCase());
  for (const w of words) s.words[w] = s.words[w] || { exposures: 0, first: null, last: null, status: 'active', source: 'anki' };
  writeFileSync(join(stateDir, 'anki-words.json'), JSON.stringify({ synced: today, deck: data.deck || null, words }, null, 2));
  save(s);
  console.log(JSON.stringify({ imported: words.length, words, note: 'these are KNOWN words: no annotation, no rate cost; prefer weaving them in as 重逢词' }));
}

else if (cmd === 'pool') {
  const s = load();
  const known = knownSet(s);
  const tier = TIERS[s.difficulty.tier];
  const limit = +arg('limit', 12);
  const rows = readFileSync(join(SKILL_DIR, 'assets', 'cefr-j-words.tsv'), 'utf8').split('\n')
    .filter((l) => !l.startsWith('#') && l.trim());
  const levelCount = new Map();
  for (const r of rows) { const [w, lvl] = r.split('\t'); levelCount.set(lvl, (levelCount.get(lvl) || 0) + 1); }
  const pool = rows.map((r) => r.split('\t')).filter(([w, lvl]) => tier.pool.includes(lvl) && !known.has(w.trim().toLowerCase()) && (s.words[w]?.exposures || 0) < 3);
  // deterministic rotation by date so the same day shows the same sample
  let seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = [];
  const pick = () => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * pool.length); };
  const seen = new Set();
  while (idx.length < Math.min(limit, pool.length) && seen.size < pool.length) { const i = pick(); if (!seen.has(i)) { seen.add(i); idx.push(i); } }
  console.log(JSON.stringify({
    tier: s.difficulty.tier, tierLabel: tier.label, targetsRange: tier.targets,
    poolSize: pool.length,
    candidates: idx.map((i) => `${pool[i][0]} (${pool[i][1]})`),
    note: 'agent picks 4–6 from candidates by topic relevance, or accepts user-specified words',
  }, null, 2));
}

else {
  console.log('commands: init | status | pend --meta f.json | confirm --session id [--score 3/3 --feel ok] | void --session id | graduate --word w | import-anki [--file j] | pool [--limit n] | interest [--add x|--remove x]');
  process.exit(cmd ? 2 : 0);
}

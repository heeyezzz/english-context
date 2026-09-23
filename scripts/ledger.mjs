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

const TIERS = {
  1: { pool: ['B1'], targets: [4, 5], label: 'A2→B1' },
  2: { pool: ['B1', 'B2'], targets: [5, 6], label: 'B1' },
  3: { pool: ['B2'], targets: [6, 7], label: 'B1→B2' },
};
const GRADUATE_AT = +arg('graduate-at', 6);
// Reading is recognition, not SRS retrieval: a short ladder beats Anki-style curves
// (a 14-day top rung would strand words in the queue forever — see backlog math).
const COOLDOWN_DAYS = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

function load() {
  if (!existsSync(stateFile)) {
    if (cmd !== 'init') { console.error('no state at ' + stateFile + ' — run `ledger.mjs init` first'); process.exit(2); }
    return { version: 1, difficulty: { tier: 1, streakGood: 0 }, words: {}, sessions: [], interests: [] };
  }
  return JSON.parse(readFileSync(stateFile, 'utf8'));
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
  if (!argv.includes('--force')) save(s); else writeFileSync(stateFile, JSON.stringify({ version: 1, difficulty: { tier: 1, streakGood: 0 }, words: {}, sessions: [], interests: [] }, null, 2));
  console.log('initialized ' + stateFile);
}

else if (cmd === 'status') {
  const s = load();
  const tier = TIERS[s.difficulty.tier];
  const pending = s.sessions.filter((x) => x.status === 'pending');
  const nominations = Object.entries(s.words).filter(([, e]) => e.status === 'active' && e.exposures >= GRADUATE_AT);
  console.log(JSON.stringify({
    tier: s.difficulty.tier, tierLabel: tier.label, targetsRange: tier.targets, streakGood: s.difficulty.streakGood, syntaxCalm: s.difficulty.syntaxCalm || 0,
    inFlight: Object.values(s.words).filter((e) => e.status === 'active' && e.exposures >= 1 && e.exposures < GRADUATE_AT).length,
    sessions: { total: s.sessions.length, counted: s.sessions.filter((x) => x.status === 'counted').length, pending: pending.map((p) => ({ id: p.id, topic: p.topic, date: p.date })) },
    activeWords: Object.entries(s.words).filter(([, e]) => e.status === 'active').map(([w, e]) => `${w}:${e.exposures}/${GRADUATE_AT}`).join(' '),
    graduationNominations: nominations.map(([w, e]) => `${w} (${e.exposures} exposures)`),
    interests: s.interests,
    skillUpdate: skillUpdate(SKILL_DIR, stateDir),
  }, null, 2));
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
  s.sessions.push({ id, date: today, topic: meta.topic || '', targets: meta.targets.map((w) => w.toLowerCase()), reunion: (meta.reunion || []).map((w) => w.toLowerCase()), status: 'pending', words: meta.words || null });
  for (const t of meta.targets.map((w) => w.toLowerCase())) {
    s.words[t] = s.words[t] || { exposures: 0, first: null, last: null, status: 'active', source: 'pool' };
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
  sess.status = 'counted'; sess.date_confirmed = today;
  const score = arg('score', null); // "3/3"
  const feel = arg('feel', null);   // flow|ok|wordy|dense
  if (score) { const [a, b] = score.split('/').map(Number); sess.score = a / b; }
  if (feel) sess.feel = feel;
  // One exposure per word per day: a second same-day appearance is still read, but not
  // counted — otherwise a binge day fakes the spacing that acquisition needs.
  const lockedToday = [];
  for (const t of sess.targets) {
    const e = s.words[t] || { exposures: 0, first: today, status: 'active', source: 'pool' };
    if (!e.first) e.first = today;
    if (e.last === today) { lockedToday.push(t); s.words[t] = e; continue; }
    e.exposures++; e.last = today; e.status = 'active';
    s.words[t] = e;
  }
  // dynamic difficulty. 体感 is a load-type diagnosis, not a scalar:
  //   flow  = i+0: material slid below the learner -> this tier's band is exhausted -> promote (x2 streak)
  //   ok    = i+1: the equilibrium we are trying to hold -> tier stays, streak resets
  //   wordy = vocabulary overload -> tier down (syntax untouched)
  //   dense = syntax overload   -> tier kept, sentences calm for the next 2 passages
  //   score < 60%               -> both levers ease at once
  s.difficulty.syntaxCalm = s.difficulty.syntaxCalm || 0;
  if (s.difficulty.syntaxCalm > 0) s.difficulty.syntaxCalm--;
  const failed = (sess.score != null && sess.score < 0.6) || feel === 'wordy';
  const flow = feel === 'flow' && (sess.score == null || sess.score >= 0.8);
  if (failed) {
    s.difficulty.streakGood = 0;
    if (s.difficulty.tier > 1) s.difficulty.tier--;
    if (sess.score != null && sess.score < 0.6) s.difficulty.syntaxCalm = 2;
  } else if (feel === 'dense') {
    s.difficulty.streakGood = 0;
    s.difficulty.syntaxCalm = 2;
  } else if (flow) {
    s.difficulty.streakGood++;
    if (s.difficulty.streakGood >= 2 && s.difficulty.tier < 3) { s.difficulty.tier++; s.difficulty.streakGood = 0; }
  } else {
    s.difficulty.streakGood = 0; // ok / mid / no answer: hold the tier, break the flow streak
  }
  save(s);
  const nominations = sess.targets.filter((t) => s.words[t].exposures >= GRADUATE_AT);
  out({
    session: id, tier: s.difficulty.tier, tierLabel: TIERS[s.difficulty.tier].label, syntaxCalm: s.difficulty.syntaxCalm,
    streakGood: s.difficulty.streakGood,
    exposures: Object.fromEntries(sess.targets.map((t) => [t, `${s.words[t].exposures}/${GRADUATE_AT}`])),
    lockedToday: lockedToday.length ? lockedToday.map((w) => `${w} — already counted today, no increment`) : undefined,
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
  const e = s.words[w] || { exposures: 0, status: 'active', source: 'pool' };
  e.status = 'known'; s.words[w] = e;
  appendFileSync(knownFile, w + '\n');
  save(s);
  out({ graduated: w, exposures: e.exposures, bridge: `optional: create a permanent flashcard via the anki-flashcard skill (dry-run → approve → confirmed)` });
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
  for (const w of words) s.words[w] = s.words[w] || { exposures: 0, first: null, last: null, status: 'active', source: 'anki' };
  writeFileSync(join(stateDir, 'anki-words.json'), JSON.stringify({ synced: today, deck: data.deck || null, words }, null, 2));
  save(s);
  out({ imported: words.length, words, note: 'these are KNOWN words: no annotation, no rate cost; prefer weaving them in as 重逢词' });
}

else if (cmd === 'pool') {
  const s = load();
  const known = knownSet(s);
  const tier = TIERS[s.difficulty.tier];
  const limit = +arg('limit', 12);
  const rows = readFileSync(join(SKILL_DIR, 'assets', 'cefr-j-words.tsv'), 'utf8').split('\n')
    .filter((l) => !l.startsWith('#') && l.trim());
  const pool = rows.map((r) => r.split('\t').map((f) => f.trim()))
    // fresh = exposures 0 (never counted). Voided pendings leave 0/6 ghosts, so key off the
    // count, not off membership; Anki/graduated zeros are already caught by known.has
    .filter(([w, lvl]) => tier.pool.includes(lvl) && !known.has(w.toLowerCase()) && (s.words[w]?.exposures || 0) === 0);
  const daysSince = (d) => d ? Math.round((Date.now() - new Date(d + 'T00:00:00')) / 86400000) : 999;
  const inFlight = Object.entries(s.words)
    .filter(([, e]) => e.status === 'active' && e.exposures >= 1 && e.exposures < GRADUATE_AT);
  // spacing: a word only re-enters the returnee pool after its ladder cooldown has passed,
  // and never on a day it already counted (same-day lock) — binge days fill with fresh words instead
  const eligible = inFlight.filter(([, e]) => e.last !== today && daysSince(e.last) >= (COOLDOWN_DAYS[e.exposures] || 1));
  const mustReuse = eligible
    .sort((a, b) => (daysSince(b[1].last) - daysSince(a[1].last)) || (b[1].exposures - a[1].exposures))
    .slice(0, 8)
    .map(([w, e]) => `${w} (${e.exposures}/${GRADUATE_AT}${e.last ? `, ${daysSince(e.last)}d unseen` : ''})`);
  // deterministic rotation by date so the same day shows the same sample
  let seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = [];
  const pick = () => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * pool.length); };
  const seen = new Set();
  while (idx.length < Math.min(limit, pool.length) && seen.size < pool.length) { const i = pick(); if (!seen.has(i)) { seen.add(i); idx.push(i); } }
  console.log(JSON.stringify({
    tier: s.difficulty.tier, tierLabel: tier.label, targetsRange: tier.targets, syntaxCalm: s.difficulty.syntaxCalm || 0,
    poolSize: pool.length,
    inFlight: inFlight.length,
    sleeping: inFlight.length - eligible.length,
    mustReuse,
    fresh: idx.map((i) => `${pool[i][0]} (${pool[i][1]})`),
    // pool = last checkpoint before drafting: force one fetch so a mid-session push from the
    // other machine is visible for at most one passage (status stays throttled).
    skillUpdate: skillUpdate(SKILL_DIR, stateDir, { force: true }),
    note: '每篇目标词配额：2–3 个 mustReuse（主题装不下的可跳过，但整篇至少带 1 个）+ 2–3 个 fresh；总数仍 4–6，照旧过硬闸',
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
    `topic: ${sess.topic}`,
    `targets: [${sess.targets.join(', ')}]`,
    `reunion: [${(sess.reunion || []).join(', ')}]`,
    `metrics: { words: ${report.words}, aboveLevelRate: ${report.aboveLevelRate}, maxSentence: ${report.maxSentence}, avgSentence: ${report.avgSentence} }`,
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
  console.log('commands: init | status | pend --meta f.json | confirm --session id [--score 3/3 --feel ok] | void --session id | graduate --word w | import-anki [--file j] | pool [--limit n] | interest [--add x|--remove x] | archive --session id --passage f.md --report r.json [--quiz "B,A,C"]');
  process.exit(cmd ? 2 : 0);
}

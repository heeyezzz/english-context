#!/usr/bin/env node
// Fail-closed publisher for the skill repo (standing rule 2026-09-23: green ship = pushed, no per-push ask).
//  1) stage everything           2) acceptance suite must pass (--no-verify only for the suite's own tests)
//  3) version lint on the diff vs origin/main:  rule-layer changed but version same -> REJECT (silent mismatch)
//                                               version changed but no rule file    -> WARN  (empty bump)
//  4) remote moved since HEAD    -> REJECT (pull first; never blind-push)
//  5) commit + push, printing exactly what consumers' skillUpdate will see.
// A rejection after step 1 leaves the staging area populated — undo with `git reset` if unwanted.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFiles, versionFromSkillMd, onlyVersionChanged } from './lib-layers.mjs';

const argv = process.argv;
const repo = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : dirname(dirname(fileURLToPath(import.meta.url)));
const msg = argv.includes('-m') ? argv[argv.indexOf('-m') + 1] : null;
const noVerify = argv.includes('--no-verify');
const die = (why) => { console.error('SHIP REJECTED: ' + why); process.exit(1); };

if (!msg) die('-m "message" required');
if (process.env.EC_SHIPPING === '1' && !noVerify) die('recursive ship detected, refusing');
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

git('add', '-A');
const staged = (git('diff', '--cached', '--name-only', 'HEAD').stdout || '').trim();
if (!staged) { console.log(JSON.stringify({ shipped: false, note: 'nothing to ship' })); process.exit(0); }
if (noVerify) console.error(':: --no-verify: suite skipped (test-only path)');
else {
  const t = spawnSync('bash', [join(repo, 'tests/acceptance.sh')], { encoding: 'utf8', env: { ...process.env, EC_SHIPPING: '1', EC_UPDATE_CHECK: '0' } });
  const out = t.stdout + t.stderr;
  if (!/pass=\d+ fail=0/.test(out) || t.status !== 0) die('acceptance not green:\n' + out.split('\n').slice(-8).join('\n'));
}

const f = git('fetch', 'origin', 'main');
if (f.status !== 0) die('cannot reach origin — push is a decision this repo makes only against a live remote');
const behind = +(git('rev-list', '--count', 'HEAD..origin/main').stdout || '0').trim();
if (behind > 0) die(`origin/main is ${behind} commit(s) ahead — pull/rebase first, never blind-push`);

const files = (git('diff', '--cached', '--name-only', 'origin/main').stdout || '').split('\n').filter(Boolean);
const { layers, ruleFiles } = classifyFiles(files);
const localSkill = readFileSync(join(repo, 'SKILL.md'), 'utf8');
const localV = versionFromSkillMd(localSkill);
// both lint legs measure against origin/main — what consumers actually have. HEAD would
// double-count an already-committed unpushed bump and force per-commit version churn.
const baseText = git('show', 'origin/main:SKILL.md').stdout || '';
const baseV = versionFromSkillMd(baseText);
// a SKILL.md diff that only moves the version: line is a bookkeeping edit, not a rule change
const ruleChanged = ruleFiles.some((f) => f !== 'SKILL.md')
  || (ruleFiles.includes('SKILL.md') && !onlyVersionChanged(baseText, localSkill));
const warnings = [];
if (ruleChanged && localV === baseV) die(`rule layer changed (${ruleFiles.slice(0, 3).join(', ')}…) but version stays ${localV} — bump it or revert`);
if (!ruleChanged && localV !== baseV) warnings.push(`empty bump ${baseV}->${localV}: version moved with no rule-layer change in the diff`);

const c = git('-c', 'user.name=heeyezzz', '-c', 'user.email=heeyezzz@users.noreply.github.com', 'commit', '-m', msg);
if (c.status !== 0) die('commit failed: ' + (c.stdout + c.stderr));
const p = git('push', 'origin', 'main');
if (p.status !== 0) die('push failed: ' + (p.stdout + p.stderr));

// what consumers will see: same fields skill-update.mjs renders
console.log(JSON.stringify({
  shipped: true, at: (git('rev-parse', '--short', 'HEAD').stdout || '').trim(), version: localV,
  consumerSees: { ruleLayer: ruleChanged, layers, files: files.slice(0, 10) },
  warnings,
}, null, 2));

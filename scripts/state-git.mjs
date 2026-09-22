#!/usr/bin/env node
// Keep ~/.english-context in sync across machines via its own private git repo.
// pull  = session start: fetch + fast-forward only; on divergence, STOP and tell the
//         agent to ask the learner which machine's ledger wins (never auto-merge state).
// push  = session end: commit all changes, rebase-pull, push. Safe for one human
//         working sequentially on two machines.
// If the state dir has no git repo, both commands are a silent no-op (exit 0).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv;
const mode = argv[2];
const i = argv.indexOf('--state-dir');
const stateDir = i >= 0 && argv[i + 1] ? argv[i + 1] : (process.env.EC_STATE_DIR || join(homedir(), '.english-context'));

if (!['pull', 'push'].includes(mode)) {
  console.log('usage: state-git.mjs pull|push [--state-dir DIR]');
  process.exit(2);
}
if (!existsSync(join(stateDir, '.git'))) {
  console.log(JSON.stringify({ synced: false, note: 'no git repo in state dir — sync disabled, single-machine mode' }));
  process.exit(0);
}
const git = (...a) => spawnSync('git', ['-C', stateDir, ...a], { encoding: 'utf8' });

if (mode === 'pull') {
  const f = git('fetch', 'origin');
  if (f.status !== 0) {
    console.log(JSON.stringify({ synced: false, offline: true, note: 'remote unreachable — safe to keep working locally; push at session end will retry' }));
    process.exit(0);
  }
  const r = git('merge', '--ff-only', 'origin/main');
  if (r.status !== 0) {
    console.log(JSON.stringify({ synced: false, conflict: true, local: git('rev-parse', 'HEAD').stdout.trim(), remote: git('rev-parse', 'origin/main').stdout.trim(), note: 'histories diverged (both machines wrote offline). ASK the learner which machine is newer, then on the newer one: git -C <state> push --force-with-lease origin main. Never blind-merge state.json.' }));
    process.exit(1);
  }
  console.log(JSON.stringify({ synced: true, at: git('rev-parse', '--short', 'HEAD').stdout.trim() }));
} else {
  git('add', '-A');
  const d = git('diff', '--cached', '--quiet'); // plumbing: locale-proof. 0 = no staged changes
  if (d.status === 0) { console.log(JSON.stringify({ pushed: false, note: 'ledger unchanged' })); process.exit(0); }
  const msg = argv.includes('--message') && argv[argv.indexOf('--message') + 1] ? argv[argv.indexOf('--message') + 1] : `ledger update ${new Date().toLocaleDateString('en-CA')}`;
  const c = git('-c', 'user.name=english-context-bot', '-c', 'user.email=english-context@local', 'commit', '-m', msg);
  if (c.status !== 0) { console.error(c.stdout + c.stderr); process.exit(1); }
  let p = git('push', 'origin', 'main');
  if (p.status !== 0) {
    const f = git('fetch', 'origin');
    if (f.status !== 0) {
      console.log(JSON.stringify({ pushed: false, offline: true, note: 'committed locally; remote unreachable — next session will retry' }));
      process.exit(0);
    }
    const r = git('pull', '--rebase', 'origin', 'main');
    if (r.status !== 0) {
      git('rebase', '--abort');
      console.log(JSON.stringify({ pushed: false, conflict: true, note: 'remote has newer commits and rebase touched the same file — resolve manually after asking the learner which machine wins.' }));
      process.exit(1);
    }
    p = git('push', 'origin', 'main');
    if (p.status !== 0) { console.error(p.stderr); process.exit(1); }
  }
  console.log(JSON.stringify({ pushed: true, at: git('rev-parse', '--short', 'HEAD').stdout.trim() }));
}

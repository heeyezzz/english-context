// Script-level "is the skill behind GitHub?" check, piggybacked on ledger.mjs
// (status/pool print its result as `skillUpdate`) — the session-start path cannot be
// skipped, so no agent has to "remember" to check. Throttled, read-only, soft-fail.
// EC_UPDATE_CHECK=0 disables (used by the test suite).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { classifyFiles, versionFromSkillMd } from './lib-layers.mjs';

const THROTTLE_H = 24;
const OFFLINE_RETRY_MIN = 10; // a failed fetch must not mute the check for a whole day

function git(repo, ...a) {
  return spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', timeout: 8000 });
}

// force=true (used by `pool`, the last checkpoint before drafting): fetch even inside the
// throttle window, so a push from the other machine mid-session is at most one passage old.
export function skillUpdate(skillDir, stateDir, { force = false } = {}) {
  if (process.env.EC_UPDATE_CHECK === '0') return { check: 'disabled' };
  const stampFile = join(stateDir, '.local', 'skill-update.json');
  // The stamp is keyed on local HEAD: pulling the skill invalidates any cached answer,
  // so "just pulled but status still says upToDate/1.6.0" cannot happen (Win finding 5).
  const head = (git(skillDir, 'rev-parse', '--short', 'HEAD').stdout || '').trim() || null;
  let stamp = null;
  try { stamp = JSON.parse(readFileSync(stampFile, 'utf8')); } catch {}
  if (stamp && stamp.head !== head) stamp = null;
  if (!force && stamp && stamp.result?.offline) force = Date.now() - stamp.ts > OFFLINE_RETRY_MIN * 60 * 1000;
  if (!force && stamp && Date.now() - stamp.ts < THROTTLE_H * 3600 * 1000) return stamp.result ?? { check: 'recent' };

  let result;
  try {
    const f = git(skillDir, 'fetch', 'origin', 'main');
    if (f.status !== 0) throw new Error('fetch failed');
    const behind = +(git(skillDir, 'rev-list', '--count', 'HEAD..origin/main').stdout || '0').trim();
    if (behind === 0) {
      result = { upToDate: true, version: versionFromSkillMd(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')) };
    } else {
      const files = (git(skillDir, 'diff', '--name-only', 'HEAD', 'origin/main').stdout || '').split('\n').filter(Boolean);
      const { layers, ruleFiles } = classifyFiles(files);
      const remoteSkill = git(skillDir, 'show', 'origin/main:SKILL.md').stdout || '';
      result = {
        behind,
        latest: (git(skillDir, 'rev-parse', '--short', 'origin/main').stdout || '').trim(),
        version: versionFromSkillMd(remoteSkill),
        localVersion: versionFromSkillMd(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')),
        ruleLayer: ruleFiles.length > 0,
        layers,
        files: files.slice(0, 10),
        action: ruleFiles.length > 0
          ? 'BEFORE drafting: tell the learner, ask to pull (scripts/assets/SKILL changed = validation rules may differ). Do not auto-pull.'
          : 'docs/tests only — keep going, mention at session end',
      };
    }
  } catch {
    result = { offline: true }; // soft-fail: network must never block a reading session
  }
  try {
    mkdirSync(join(stateDir, '.local'), { recursive: true });
    writeFileSync(stampFile, JSON.stringify({ ts: Date.now(), head, result }));
  } catch {}
  return result;
}

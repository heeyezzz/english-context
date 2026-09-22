// Shared classification module: what counts as a RULE layer vs docs/tests.
// Used by skill-update.mjs (consumer preview) and ship.mjs (publisher lint) —
// one source of truth, so the two machines can never disagree on "what is a rule change".
import { readFileSync } from 'node:fs';

export const RULE_PATHS = ['scripts/', 'SKILL.md', 'references/', 'assets/'];

export function isRuleLayer(file) {
  return RULE_PATHS.some((p) => file === p.replace(/\/$/, '') || file.startsWith(p));
}

export function classifyFiles(files) {
  const rule = files.filter(isRuleLayer);
  const other = files.filter((f) => !isRuleLayer(f));
  const layers = [...new Set(rule.map((f) => (f.includes('/') ? f.split('/')[0] + '/' : f)))];
  return { ruleFiles: rule, otherFiles: other, layers };
}

export function versionFromSkillMd(text) {
  const m = /^version:\s*(\S+)/m.exec(text);
  return m ? m[1] : null;
}

// True when two SKILL.md texts differ ONLY in the `version:` line — i.e. the bump
// itself is the whole change, which the ship lint must read as "no rule change".
export function onlyVersionChanged(oldText, newText) {
  const strip = (t) => t.replace(/^version:[ \t]*\S+[ \t]*$/m, '');
  return strip(oldText) === strip(newText);
}

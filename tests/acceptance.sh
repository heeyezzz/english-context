#!/usr/bin/env bash
# english-context acceptance suite. Read-only against Anki; all state writes go to a temp dir.
set -u
export EC_UPDATE_CHECK=0   # the suite never touches the network; skillUpdate shape is still asserted
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
S="$SKILL_DIR/scripts"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
STATE="$T/state"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; }
check() { # $1 desc, $2 expected exit(0/1/other), rest cmd...
  local desc="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1; local got=$?
  if { [ "$want" = "0" ] && [ "$got" = "0" ]; } || { [ "$want" = "1" ] && [ "$got" != "0" ]; }; then ok "$desc"; else bad "$desc (exit $got, want $want)"; fi
}
grepj() { grep -q "$1" "$2"; }

# ---- fixture: trial passage (calibrated 2026-09-22) ----
mkdir -p "$T"
cat > "$T/passage.md" <<'EOF'
# Trains That Tell You the Truth

Every morning, Mei, 28, takes the same train to work in Tokyo. Two years ago, the trains were often late, and nobody knew why. Now a small program on her phone tells her the truth before she leaves home. "The 8:10 will be fourteen minutes late," it says. "Heavy rain near the river slows the trains."

The program is part of a new public **service** in Japan. The idea is simple. Every train carries small sensors. They **measure** speed, weight and temperature inside the train, again and again, every minute. The numbers help the **service** find small problems early, before the trains must stop.

Every night, a computer reads all the numbers and **updates** the schedule for tomorrow. It **updates** again at six. In the morning, the company uses it to decide where to allocate extra trains. "Last month, ninety-five of every hundred answers about time were **accurate**," says Mr. Sato. "Before, we were right only about half the time."

Passengers notice the difference. At Shinjuku Station, people used to stand in long lines on the **platform**, looking worried. The station now shows the same answers on every **platform** screen. People can wait at home until the right minute. "I do not run for my train any more," says a student. "The program is right, so I can drink my coffee first."

The team behind the program says **accurate** numbers are only the start. It now wants passengers to volunteer for the next one. What they really want is trust. When people trust the information, they use it. When they use it, the trains can **measure** more, and tomorrow can be better than today. For Mei, the change is small but sweet. "I used to hate Monday mornings," she says. "Now I look at my phone, and I know what to do."
EOF
META='{"topic":"trains","targets":["service","measure","update","accurate","platform"],"reunion":["schedule","allocate","volunteer"],"names":["mei","tokyo","shinjuku","sato","japan"]}'
echo "$META" > "$T/meta.json"
PC() { node "$S/passage-check.mjs" --passage "$1" --meta "$2" --state-dir "$STATE"; }

echo "== passage-check =="
check "trial passage passes all hard rules" 0 PC "$T/passage.md" "$T/meta.json"

# win-reported 2026-09-23: 'goes' (4-letter -es) fell through the [sxzo] rule guarded by >4,
# landing on the 'goe' fallback and failing as undeclared OFF. Locks that one grid cell.
sed 's/and I know what to do/and I know where it goes/' "$T/passage.md" > "$T/goes.md"
PC "$T/goes.md" "$T/meta.json" > "$T/goes.json" 2>/dev/null
grepj '"pass": true' "$T/goes.json" && ok "4-letter -es form 'goes' lemmatizes to go (guard fixed)" || bad "goes lemma guard regression"

sed 's/before the trains must stop/before the trains must depart permanently on the way/' "$T/passage.md" > "$T/undeclared.md"
PC "$T/undeclared.md" "$T/meta.json" > "$T/r1.json" 2>/dev/null
grepj 'undeclared above-level' "$T/r1.json" && ok "undeclared above-level word rejected" || bad "undeclared detection missing"

sed 's/It \*\*updates\*\* again at six.//' "$T/passage.md" | sed 's/and \*\*updates\*\* the schedule/and the schedule/' > "$T/single-hit.md"
PC "$T/single-hit.md" "$T/meta.json" > "$T/r2.json" 2>/dev/null
grepj 'target .*update.* occurs' "$T/r2.json" && ok "target below 2 exposures rejected" || bad "re-exposure rule missing"

python3 - "$T" <<'PY'
import sys, re
t = open(f"{t0}/passage.md".replace("$T", x) if False else sys.argv[1] + "/passage.md").read()
long = 'People who live in the city often think that they can never enjoy quiet mornings because the noise from the streets keeps them awake until very late at night. '
open(sys.argv[1] + "/longsentence.md", "w").write(t.replace("The idea is simple.", long))
PY
PC "$T/longsentence.md" "$T/meta.json" > "$T/r3.json" 2>/dev/null
grepj 'longest sentence' "$T/r3.json" && ok "over-long sentence rejected" || bad "sentence-length rule missing"

echo '{"targets":["service","measure","update","accurate"],"reunion":[],"names":["mei","tokyo","shinjuku","sato","japan"]}' > "$T/meta-badcount.json"
echo "# t\n\nSome text here." > "$T/short.md"
PC "$T/short.md" "$T/meta-badcount.json" > "$T/r4.json" 2>/dev/null
grepj 'passage length' "$T/r4.json" && ok "too-short passage rejected" || bad "length rule missing"

echo '{"targets":["whistle","candle","generate","humanity"],"reunion":[],"names":[]}' > "$T/meta-unbolded.json"
cp "$T/passage.md" "$T/unbolded.md"  # targets absent → fail anyway, but check bold warn path
PC "$T/unbolded.md" "$T/meta-unbolded.json" > "$T/r5.json" 2>/dev/null
grepj 'never appears inside' "$T/r5.json" && ok "unbolded target produces highlight warning" || bad "bold warning missing"

echo "== ledger =="
L() { node "$S/ledger.mjs" "$@" --state-dir "$STATE"; }
check "init" 0 L init
echo '{"words":["allocate","schedule","volunteer","postpone"]}' > "$T/anki.json"
L import-anki --file "$T/anki.json" > /dev/null 2>&1 && ok "import-anki" || bad "import-anki"
# known-forms regression (win-reported): "allocates" whose base lives only in the Anki known
# list, and the compounded "cannot" - neither may be flagged, allocate must count as reunion
cat > "$T/knownforms.md" <<'KF'
He **cannot** **whistle** near the **candle**; the **tremble** and the **sore** finger end by morning. She **allocates** wax to the **candle**, and the **whistle** returns when the **tremble** ends. He **cannot** sing, so the **sore** throat waits, and the **whistle** sleeps.
KF
echo '{"topic":"kf","targets":["whistle","candle","tremble","sore"],"reunion":["allocate"],"names":[]}' > "$T/knownforms.json"
node "$S/passage-check.mjs" --passage "$T/knownforms.md" --meta "$T/knownforms.json" --state-dir "$STATE" --min-words 1 --max-words 9999 --max-rate 100 > "$T/kf.json" 2>/dev/null
python3 -c "
import json,sys
r=json.load(open('$T/kf.json'))
bad=[u for u in r['undeclared'] if u.split(' ')[0] in ('allocates','cannot')]
assert not bad, 'known-forms still flagged: %s' % bad
assert 'allocate' in r['reunionUsed'], 'allocate not counted as reunion word'
" && ok "known-word -s forms and cannot normalize to their bases" || bad "known-forms regression"
L pend --meta "$T/meta.json" > "$T/pend.json" 2>/dev/null
SID=$(python3 -c "import json;print(json.load(open('$T/pend.json'))['session'])")
grepj '"status": "pending"' "$STATE/state.json" && ok "pend records session as pending (no exposure yet)" || bad "pend status"
L status > "$T/st.json" 2>/dev/null
grepj '"pending"' "$T/st.json" && ok "status lists pending session" || bad "status pending"
check "confirm unknown id refused" 1 L confirm --session definitely-not-here
L confirm --session "$SID" --score 3/3 --feel ok > "$T/cf.json" 2>/dev/null
grepj '1/6' "$T/cf.json" && ok "confirm counts exposures" || bad "confirm exposures"
grepj '"syntaxCalm": 0' "$T/cf.json" && ok "ok feedback leaves syntaxCalm at 0" || bad "syntaxCalm on ok"
grepj '"tier": 1' "$T/cf.json" && ok "single good session does not promote" || bad "premature promotion"
# ok = i+1 equilibrium: it holds the tier and never accumulates a promotion streak
L pend --meta "$T/meta.json" > "$T/p_ok.json" 2>/dev/null
SID_OK=$(python3 -c "import json;print(json.load(open('$T/p_ok.json'))['session'])")
L confirm --session "$SID_OK" --score 3/3 --feel ok > "$T/cf_ok2.json" 2>/dev/null
grepj '"tier": 1' "$T/cf_ok2.json" && grepj '"streakGood": 0' "$T/cf_ok2.json" && ok "two consecutive ok sessions hold the tier (ok is not a promotion signal)" || bad "ok wrongly accumulates toward promotion"
grepj 'already counted today' "$T/cf_ok2.json" && ok "confirm reports same-day locks instead of silently skipping" || bad "lock not reported"
# same-day lock: words counted today are not offered again; they sleep until the cooldown passes
L pool --limit 4 > "$T/pool1.json" 2>/dev/null
grepj '"mustReuse": \[\]' "$T/pool1.json" && grepj '"sleeping": 5' "$T/pool1.json" && ok "same-day lock: today's words sleep, no returnee offered" || bad "same-day lock"
# once the cooldown has passed they re-enter the returnee pool
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));const d=new Date(Date.now()-3*86400000).toLocaleDateString('en-CA');for(const w of Object.keys(s.words))if(s.words[w].status==='active'&&s.words[w].exposures>=1)s.words[w].last=d;require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool2.json" 2>/dev/null
grepj 'service (1/6,' "$T/pool2.json" && ok "past-cooldown word re-enters mustReuse" || bad "cooldown gate blocks a due word"
# sort direction regression (v1.7.0): mustReuse is longest-unseen-first, per SKILL.md step 4
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.service.last=new Date(Date.now()-6*86400000).toLocaleDateString('en-CA');require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool_sort.json" 2>/dev/null
node -e "const p=JSON.parse(require('fs').readFileSync('$T/pool_sort.json','utf8'));process.exit(p.mustReuse.length && p.mustReuse[0].startsWith('service ') ? 0 : 1)" \
  && ok "mustReuse sorts longest-unseen first (6d beats 3d)" || bad "mustReuse sort direction"
# dense: syntax overload must NOT demote tier but must arm the sentence-calmer
L pend --meta "$T/meta.json" > "$T/p2.json" 2>/dev/null
SID2=$(python3 -c "import json;print(json.load(open('$T/p2.json'))['session'])")
L confirm --session "$SID2" --score 3/3 --feel dense > "$T/cf2.json" 2>/dev/null
grepj '"tier": 1' "$T/cf2.json" && grepj '"syntaxCalm": 2' "$T/cf2.json" && ok "dense keeps tier, arms syntaxCalm=2" || bad "dense routing"
# wordy: vocabulary overload never RE-ARMS the calmer; it only consumes the calm budget (dense's 2 -> 1)
L pend --meta "$T/meta.json" > /dev/null 2>&1
SID3=$(python3 -c "import json;s=json.load(open('$STATE/state.json'));print([x['id'] for x in s['sessions'] if x['status']=='pending'][-1])")
L confirm --session "$SID3" --score 3/3 --feel wordy > "$T/cf3.json" 2>/dev/null
grepj '"syntaxCalm": 1' "$T/cf3.json" && ok "wordy consumes calm budget but does not re-arm (2->1)" || bad "wordy routing"
L confirm --session "$SID2" --state-dir "$STATE" >/dev/null 2>&1 && bad "double confirm accepted" || ok "double confirm refused"
# void also removes the archived passage file (pend 写、void 删)
L pend --meta "$T/meta.json" > "$T/p_v.json" 2>/dev/null
SIDV=$(python3 -c "import json;print(json.load(open('$T/p_v.json'))['session'])")
mkdir -p "$STATE/passages"; echo "# archived draft" > "$STATE/passages/$SIDV.md"
L void --session "$SIDV" > "$T/vt.json" 2>/dev/null
grepj '"passageRemoved": true' "$T/vt.json" && [ ! -f "$STATE/passages/$SIDV.md" ] && ok "void deletes the archived passage" || bad "void archive removal"
# regression (win bug): a voided session must strand no 0/6 ghosts outside both pools
echo '{"topic":"ghost","targets":["whistle"],"reunion":[],"names":[]}' > "$T/ghost.json"
L pend --meta "$T/ghost.json" > "$T/ghost_p.json" 2>/dev/null
GID=$(python3 -c "import json;print(json.load(open('$T/ghost_p.json'))['session'])")
L void --session "$GID" > /dev/null 2>&1
L pool --limit 3000 > "$T/ghost_pool.json" 2>/dev/null
python3 -c "import json;d=json.load(open('$T/ghost_pool.json'));assert any(c.startswith('whistle ') for c in d['fresh'])" && ok "voided word returns to fresh (no 0/6 ghost lost)" || bad "void strands ghosts out of both pools"
for i in 2 3; do
  L pend --meta "$T/meta.json" > /dev/null 2>&1
  SID2=$(python3 -c "import json;s=json.load(open('$STATE/state.json'));print([x['id'] for x in s['sessions'] if x['status']=='pending'][-1])")
  # allow same-day duplicates by unique suffix
  L confirm --session "$SID2" --score 3/3 --feel flow > /dev/null 2>&1 || \
  { node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));const d=s.sessions.filter(x=>x.status==='pending').pop();d.id+='-$i';require('fs').writeFileSync(f,JSON.stringify(s))"; L confirm --session "$SID2-$i" --score 3/3 --feel flow > /dev/null 2>&1; }
done
grepj '"tier": 2' "$STATE/state.json" && ok "two more good (flow) sessions promote tier 1->2" || bad "promotion rule"
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.service.exposures=6;require('fs').writeFileSync(f,JSON.stringify(s))"
L graduate --word service > "$T/gr.json" 2>/dev/null
grepj 'anki-flashcard' "$T/gr.json" && ok "graduation prints Anki bridge offer" || bad "bridge missing"
grepj '^service$' "$STATE/known-words.txt" && ok "graduated word lands in known-words.txt" || bad "known-words write"
L interest --add "urban trains" > /dev/null 2>&1 && grepj "urban trains" "$STATE/state.json" && ok "interest add" || bad "interest add"
L pool --limit 6 > "$T/pool.json" 2>/dev/null
grepj 'mustReuse' "$T/pool.json" && grepj 'fresh' "$T/pool.json" && ok "pool returns mustReuse + fresh" || bad "pool"
# anti-repeat exposure (v1.9.0): pool must carry the last <=5 non-void sessions, topic+targets included
node -e "const r=JSON.parse(require('fs').readFileSync('$T/pool.json','utf8')).recent||[];process.exit(r.length>0&&r.length<=5&&r.every((x)=>Array.isArray(x.targets)&&typeof x.topic==='string')?0:1)" \
  && ok "pool exposes recent history (<=5 non-void sessions with topic+targets)" || bad "recent exposure shape"
grepj '"mustReuse": \[\]' "$T/pool.json" && ok "no returnee leaks: everything is locked today or at threshold" || bad "mustReuse leaks"
python3 - "$T" "$STATE" <<'PY'
import json, sys
pool = json.load(open(sys.argv[1] + "/pool.json"))
words = json.load(open(sys.argv[2] + "/state.json"))
known = [w for w, e in words["words"].items() if e["status"] == "known"]
fresh = [c.split(" ")[0] for c in pool["fresh"]]
must = [c.split(" ")[0] for c in pool["mustReuse"]]
assert not (set(fresh) & set(known)), f"graduated word in fresh pool: {known}"
assert not any(words["words"].get(w, {}).get("exposures", 0) > 0 for w in fresh), "word with exposures>0 leaked into fresh"
assert not (set(must) & set(known)), "graduated word leaked into mustReuse"
assert pool["inFlight"] >= 4, "inFlight not reported"
PY
[ $? -eq 0 ] && ok "fresh excludes known and in-progress words" || bad "pool leaks known/in-progress words"

echo "== skillUpdate wiring (status/pool carry the field; soft-fail) =="
node "$S/ledger.mjs" status --state-dir "$STATE" > "$T/st_up.json" 2>/dev/null
grepj '"check": "disabled"' "$T/st_up.json" && ok "status output carries skillUpdate" || bad "skillUpdate not wired into status"
node "$S/ledger.mjs" pool --state-dir "$STATE" --limit 3 > "$T/pu_up.json" 2>/dev/null
grepj '"check": "disabled"' "$T/pu_up.json" && ok "pool output carries skillUpdate" || bad "skillUpdate not wired into pool"
mkdir -p "$T/noorigin" && git -C "$T/noorigin" init -q 2>/dev/null
# NB: paths go in via ARGV (MSYS converts those to native form) and become file:// through
# pathToFileURL — embedding a git-bash /c/... path in the -e string breaks native node.
# NB2: the env var is cleared inside node (`delete process.env`) — `env -u VAR cmd` silently
# no-ops when a shadowed env.exe wins PATH (Win 2026-09-23), and shell unset syntax diverges.
node -e 'const {pathToFileURL}=require("node:url");delete process.env.EC_UPDATE_CHECK;Promise.all([import(pathToFileURL(process.argv[1]).href),import("node:fs")]).then(([{skillUpdate},{writeFileSync}])=>writeFileSync(process.argv[4],JSON.stringify(skillUpdate(process.argv[2],process.argv[3]))))' "$S/skill-update.mjs" "$T/noorigin" "$T/offstate" "$T/off.json"
grepj '"offline":true' "$T/off.json" && ok "skillUpdate soft-fails to offline when fetch impossible" || bad "skillUpdate soft-fail"
PC "$T/passage.md" "$T/meta.json" > "$T/pc_sig.json" 2>/dev/null
grepj '"validatedBy": "[0-9].*sha256:' "$T/pc_sig.json" && ok "passage-check report carries validator signature (version+hash)" || bad "validatedBy signature missing from report"

echo "== ship.mjs fail-closed publisher =="
ORIGIN="$T/ship-origin.git"; SHIPR="$T/ship-repo"
git init -q --bare -b main "$ORIGIN"
git clone -q "$ORIGIN" "$SHIPR" 2>/dev/null
mkdir -p "$SHIPR/scripts"
cp "$S/ship.mjs" "$S/lib-layers.mjs" "$SHIPR/scripts/"
printf -- '---\nname: t\nversion: 0.1.0\n---\n# t\n' > "$SHIPR/SKILL.md"
git -C "$SHIPR" add -A && git -C "$SHIPR" -c user.name=t -c user.email=t@t commit -qm base && git -C "$SHIPR" push -q origin main
SHIPW() { node "$SHIPR/scripts/ship.mjs" --repo "$SHIPR" --no-verify -m "$1"; }
echo x > "$SHIPR/scripts/new-rule.mjs"
SHIPW "must-reject" > "$T/s1.out" 2> "$T/s1.err"
{ [ $? != 0 ] && grep -q "SHIP REJECTED" "$T/s1.err" && grep -q "version" "$T/s1.err"; } \
  && ok "ship rejects rule-layer change without a version bump" || bad "ship version lint (reject path)"
git -C "$SHIPR" reset -q && rm -f "$SHIPR/scripts/new-rule.mjs"
echo hello > "$SHIPR/README.md"
SHIPW "docs only" > "$T/s2.out" 2> "$T/s2.err"
grep -q '"shipped": true' "$T/s2.out" && ok "docs-only change ships clean (no bump needed)" || bad "docs-only ship: $(cat "$T/s2.err")"
printf -- '---\nname: t\nversion: 0.2.0\n---\n# t\n' > "$SHIPR/SKILL.md"
echo more >> "$SHIPR/README.md"
SHIPW "empty bump" > "$T/s3.out" 2> "$T/s3.err"
grep -q '"shipped": true' "$T/s3.out" && grep -q "empty bump" "$T/s3.out" && ok "bump without rule file ships with empty-bump warning" || bad "empty bump warning"
git clone -q "$ORIGIN" "$T/ship-second" 2>/dev/null
echo other >> "$T/ship-second/README.md"
git -C "$T/ship-second" add -A && git -C "$T/ship-second" -c user.name=u -c user.email=u@u commit -qm other && git -C "$T/ship-second" push -q origin main
echo mine >> "$SHIPR/README.md"
SHIPW "must-reject-ahead" > "$T/s4.out" 2> "$T/s4.err"
{ [ $? != 0 ] && grep -q "origin/main is" "$T/s4.err"; } && ok "ship refuses when origin moved ahead (no blind push)" || bad "remote-moved guard"
# version-leg baseline regression (Win 2026-09-23 report): both lint legs must measure against
# origin/main, not HEAD — an unpushed bump must satisfy a later rule edit without re-churn.
git -C "$SHIPR" reset -q && git -C "$SHIPR" checkout -q -- .   # reset FIRST: a rejected ship left its add -A in the index
git -C "$SHIPR" -c user.name=t -c user.email=t@t pull -q --rebase origin main  # absorb ship-second's 'other' commit first
printf -- '---\nname: t\nversion: 0.3.0\n---\n# t\nrule note\n' > "$SHIPR/SKILL.md"
git -C "$SHIPR" add -A && git -C "$SHIPR" -c user.name=t -c user.email=t@t commit -qm "bump+rule, left unpushed"
echo y > "$SHIPR/scripts/another-rule.mjs"
SHIPW "origin-baseline" > "$T/s5.out" 2> "$T/s5.err"
grep -q '"shipped": true' "$T/s5.out" && ok "ship version-leg compares to origin/main (unpushed bump honored)" || bad "version-leg baseline: $(cat "$T/s5.err")"

echo "== archive (scripted step-6) =="
node "$S/passage-check.mjs" --passage "$T/passage.md" --meta "$T/meta.json" --state-dir "$STATE" --report "$T/rep_ok.json" > /dev/null 2>&1
grepj '"passageSha256"' "$T/rep_ok.json" && ok "--report writes report file containing passageSha256" || bad "--report/passageSha256"
L pend --meta "$T/meta.json" > "$T/a_p1.json" 2>/dev/null
SID_A=$(python3 -c "import json;print(json.load(open('$T/a_p1.json'))['session'])")
L archive --session "$SID_A" --passage "$T/passage.md" --report "$T/rep_ok.json" --quiz "B,A,C" > "$T/a_ok.json" 2> "$T/a_ok.err"
{ [ $? = 0 ] && grepj "\"archived\": \"$SID_A\"" "$T/a_ok.json" && [ -f "$STATE/passages/$SID_A.md" ]; } && ok "archive happy path: file written, id reported" || bad "archive happy path: $(cat "$T/a_ok.err")"
grepj "^session: $SID_A$" "$STATE/passages/$SID_A.md" && grepj 'quizAnswers: \[B, A, C\]' "$STATE/passages/$SID_A.md" && grepj '^validatedBy: .*sha256:' "$STATE/passages/$SID_A.md" && ok "frontmatter: session/quizAnswers/validatedBy generated mechanically" || bad "archive frontmatter content"
grepj '"validatedBy":' "$T/a_ok.json" && grep -q 'Trains That Tell You the Truth' "$STATE/passages/$SID_A.md" && ok "report echoes signature; body is the validated file verbatim" || bad "archive body/signature"
# tamper: different bytes under the same report must be refused, no file left behind
L pend --meta "$T/meta.json" > "$T/a_p2.json" 2>/dev/null
SID_B=$(python3 -c "import json;print(json.load(open('$T/a_p2.json'))['session'])")
sed 's/ninety-five of every hundred/four of five/' "$T/passage.md" > "$T/passage-tampered.md"
L archive --session "$SID_B" --passage "$T/passage-tampered.md" --report "$T/rep_ok.json" > /dev/null 2> "$T/a_t.err"
{ [ $? != 0 ] && grep -qi 'sha256' "$T/a_t.err" && [ ! -f "$STATE/passages/$SID_B.md" ]; } \
  && ok "archive refuses passage modified after validation (sha256 anchor)" || bad "archive tamper check"
echo '{"pass": false}' > "$T/rep_bad.json"
L archive --session "$SID_B" --passage "$T/passage.md" --report "$T/rep_bad.json" > /dev/null 2> "$T/a_bad.err"
{ [ $? != 0 ] && grep -q 'pass is not true' "$T/a_bad.err"; } && ok "archive refuses a non-passing report" || bad "archive pass gate"
L archive --session "$SID_A" --passage "$T/passage.md" --report "$T/rep_ok.json" > /dev/null 2> "$T/a_dup.err"
{ [ $? != 0 ] && grep -q 'append-only' "$T/a_dup.err"; } && ok "duplicate archive refused (append-only, never rewrites)" || bad "archive dup guard"
check "archive refuses unknown session" 1 L archive --session no-such-session --passage "$T/passage.md" --report "$T/rep_ok.json"
# counted sessions must not archive either
L confirm --session "$SID_A" --score 2/3 --feel ok > /dev/null 2>&1
L archive --session "$SID_A" --passage "$T/passage.md" --report "$T/rep_ok.json" > /dev/null 2> "$T/a_cnt.err"
grep -q 'only pending' "$T/a_cnt.err" && ok "archive refuses already-counted session" || bad "archive status gate"

echo "== sync-anki-words (read-only) =="
node "$S/sync-anki-words.mjs" --out "$T/anki-live.json" > /dev/null 2>&1
if [ -f "$T/anki-live.json" ]; then
  grepj 'allocate' "$T/anki-live.json" && ok "live Anki pull finds known word 'allocate'" || bad "live pull content"
else
  ok "Anki endpoint absent -> sync fails soft with message (skipped live content)"
fi

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]

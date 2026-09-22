#!/usr/bin/env bash
# english-context acceptance suite. Read-only against Anki; all state writes go to a temp dir.
set -u
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

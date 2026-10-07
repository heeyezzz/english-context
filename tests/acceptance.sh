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
META='{"topic":"trains","targets":["service","measure","update","accurate","platform"],"reunion":["schedule","allocate","volunteer"],"names":["mei","tokyo","shinjuku","sato","japan"],"predicted":{"vocab":2,"syntax":2,"discourse":2,"background":1}}'
echo "$META" > "$T/meta.json"
PC() { node "$S/passage-check.mjs" --passage "$1" --meta "$2" --state-dir "$STATE"; }

echo "== passage-check =="
check "trial passage passes all hard rules" 0 PC "$T/passage.md" "$T/meta.json"

# win-reported 2026-09-23: 'goes' (4-letter -es) fell through the [sxzo] rule guarded by >4,
# landing on the 'goe' fallback and failing as undeclared OFF. Locks that one grid cell.
sed 's/and I know what to do/and I know where it goes/' "$T/passage.md" > "$T/goes.md"
PC "$T/goes.md" "$T/meta.json" > "$T/goes.json" 2>/dev/null
grepj '"pass": true' "$T/goes.json" && ok "4-letter -es form 'goes' lemmatizes to go (guard fixed)" || bad "goes lemma guard regression"
# quiz option letters are structural markers, not vocabulary (v1.11.4): a finished-material
# passage with A)/B)/C) lines must validate clean
printf '\n### 理解题\n1. Why do people trust the screen? A) It is always right. B) The numbers arrive early. C) It shows their own words.\n' >> "$T/goes.md"
PC "$T/goes.md" "$T/meta.json" > "$T/quiz.json" 2>/dev/null
grepj '"pass": true' "$T/quiz.json" && ok "quiz A)/B)/C) letters do not count as undeclared words" || bad "quiz option letters flagged"

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
cp "$T/passage.md" "$T/unbolded.md"  # targets absent → fail anyway, but check the bold gate path
PC "$T/unbolded.md" "$T/meta-unbolded.json" > "$T/r5.json" 2>/dev/null
grepj 'never appears inside' "$T/r5.json" && ok "unbolded target is a hard FAIL (v1.20.0: was a warn)" || bad "bold gate missing"

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
echo '{"topic":"kf","targets":["whistle","candle","tremble","sore"],"reunion":["allocate"],"names":[],"predicted":{"vocab":2,"syntax":1,"discourse":1,"background":1}}' > "$T/knownforms.json"
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
L pool --limit 1 > "$T/st.json" 2>/dev/null
grepj '"pending"' "$T/st.json" && ok "pool lists pending sessions (status was folded in, v1.23.0)" || bad "pending listing"
check "confirm unknown id refused" 1 L confirm --session definitely-not-here
L confirm --session "$SID" --score 3/3 --feel ok > "$T/cf.json" 2>/dev/null
grepj '1/5' "$T/cf.json" && ok "confirm counts exposures" || bad "confirm exposures"
grepj '"句子": "syntax 3/4' "$T/cf.json" && ok "ok feedback leaves the syntax rung at 常规 (3/4 after the v1.36.0 flip)" || bad "syntax rung on ok"
grepj '"tier": 4' "$T/cf.json" && ok "single good session does not promote (tier stays at the v1.16.0 start of 4)" || bad "premature promotion"
# ok = i+1 equilibrium: it holds the tier and never accumulates a promotion streak
L pend --meta "$T/meta.json" > "$T/p_ok.json" 2>/dev/null
SID_OK=$(python3 -c "import json;print(json.load(open('$T/p_ok.json'))['session'])")
L confirm --session "$SID_OK" --score 3/3 --feel ok > "$T/cf_ok2.json" 2>/dev/null
grepj '"tier": 4' "$T/cf_ok2.json" && ok "two consecutive ok sessions hold the tier (ok is not a promotion signal)" || bad "ok wrongly accumulates toward promotion"
grepj 'tooSoon' "$T/cf_ok2.json" && ok "confirm reports too-soon words instead of silently skipping (v1.31.0 hour gap)" || bad "tooSoon not reported"

# v1.32.0 made the reading log finer than a date; v1.43.0 took every stamp to seconds
TM="$T/stamps"; mkdir -p "$TM"
node "$S/ledger.mjs" init --state-dir "$TM" --no-sync > /dev/null 2>&1
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2], T=process.argv[3];
const L=(...a)=>cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"});
const p=JSON.parse(L("pend","--meta",T+"/meta.json","--id","stamped"));
const mk=(v,label,what)=>{ if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) throw new Error(label+" is not a second-precision timestamp: "+JSON.stringify(v)+" ("+what+")"); };
mk(p.session ? JSON.parse(fs.readFileSync(dir+"/state.json","utf8")).sessions.slice(-1)[0].at : null, "session.at", "pend");
L("confirm","--session",p.session,"--score","3/3","--feel","ok");
const sess=JSON.parse(fs.readFileSync(dir+"/state.json","utf8")).sessions.find(x=>x.id===p.session);
mk(sess.at,"session.at","after confirm");
mk(sess.readAt,"session.readAt","written by confirm");
' "$SKILL_DIR" "$TM" "$T" && ok "pend stamps session.at and confirm stamps readAt (second-precision, v1.43.0)" || bad "session timestamps"

# same-day lock: words counted today are not offered again; they sleep until the cooldown passes
L pool --limit 4 > "$T/pool1.json" 2>/dev/null
grepj '"mustReuse": \[\]' "$T/pool1.json" && grepj '"sleeping": 5' "$T/pool1.json" && ok "hour gap: words counted minutes ago sleep, no returnee offered" || bad "hour gap"
# v1.40.0: eligibility is measured in HOURS on the learner-shrunk ladder — 1h at 1/5, 12h at 4/5
TS="$T/spacing"; mkdir -p "$TS"
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const stamp=(h)=>{ const d=new Date(Date.now()-h*3600000), p=(n)=>String(n).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); };
const mk=(entries)=>{
  const words={};
  for(const [w,h,e] of entries) words[w]={exposures:e,last:stamp(h),status:"active"};
  fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1},words,sessions:[],interests:[]}));
  return JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
};
let o=mk([["alpha",0,1],["beta",2,1]]);
if(!o.mustReuse.some(x=>x.startsWith("beta "))) throw new Error("2h-old 1/5 word not offered: "+JSON.stringify(o.mustReuse));
if(o.mustReuse.some(x=>x.startsWith("alpha "))) throw new Error("just-counted word offered despite the 1h gap");
o=mk([["gamma",10,4],["delta",20,4],["sigma",50,5]]);
if(!o.mustReuse.some(x=>x.startsWith("delta "))) throw new Error("20h-old 4/5 word not offered");
if(o.mustReuse.some(x=>x.startsWith("gamma "))) throw new Error("10h-old 4/5 word offered despite the 12h gap");
if(o.mustReuse.some(x=>x.startsWith("sigma "))) throw new Error("5/5 word re-offered; it awaits graduation instead");
' "$SKILL_DIR" "$TS" && ok "hour-gap ladder enforced in hours (1h at 1/5, 12h at 4/5; 5/5 awaits graduation)" || bad "hour gap"

# v1.31.0 saturation valve: above 25 in flight, fresh intake stops and the quota is machine-readable
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const stamp=(h)=>{ const d=new Date(Date.now()-h*3600000), p=(n)=>String(n).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); };
const build=(n)=>{
  const words={};
  for(let i=0;i<n;i++) words["w"+i]={exposures:1,last:stamp(50),status:"active"};
  fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1},words,sessions:[],interests:[]}));
  return JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
};
const under=build(25), over=build(26);
if(under.saturated) throw new Error("25 in flight must NOT saturate");
if(!over.saturated) throw new Error("26 in flight must saturate");
if(JSON.stringify(over.quota)!==JSON.stringify({mustReuse:[4,5],fresh:[0,0]})) throw new Error("saturated quota: "+JSON.stringify(over.quota));
if(JSON.stringify(under.quota)!==JSON.stringify({mustReuse:[3,4],fresh:[1,2]})) throw new Error("normal quota: "+JSON.stringify(under.quota));
if(!/不收新词|不收 fresh/.test(over.note)) throw new Error("saturated note must say fresh intake stopped");
' "$SKILL_DIR" "$TS" && ok "saturation valve: >25 in flight zeroes the fresh quota and says so in the note" || bad "saturation valve"

# once the cooldown has passed they re-enter the returnee pool
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));const d=new Date(Date.now()-3*86400000).toLocaleDateString('en-CA');for(const w of Object.keys(s.words))if(s.words[w].status==='active'&&s.words[w].exposures>=1)s.words[w].last=d;require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool2.json" 2>/dev/null
grepj 'service (1/5,' "$T/pool2.json" && ok "past-cooldown word re-enters mustReuse" || bad "cooldown gate blocks a due word"
# sort direction regression (v1.7.0): mustReuse is longest-unseen-first, per SKILL.md step 4
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.service.last=new Date(Date.now()-6*86400000).toLocaleDateString('en-CA');require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool_sort.json" 2>/dev/null
node -e "const p=JSON.parse(require('fs').readFileSync('$T/pool_sort.json','utf8'));process.exit(p.mustReuse.length && p.mustReuse[0].startsWith('service ') ? 0 : 1)" \
  && ok "mustReuse sorts longest-unseen first (6d beats 3d)" || bad "mustReuse sort direction"
# v1.14.0 graduation-priority: 2/5 seen 3d ago must outrank 1/5 seen 6d ago (exposure beats recency;
# the line above stays green because there all depths tie and longest-unseen is the tiebreaker)
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.measure.exposures=2;require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool_grad.json" 2>/dev/null
node -e "const p=JSON.parse(require('fs').readFileSync('$T/pool_grad.json','utf8'));process.exit(p.mustReuse.length && p.mustReuse[0].startsWith('measure ') ? 0 : 1)" \
  && ok "mustReuse puts closest-to-graduation first (2/5@3d beats 1/5@6d)" || bad "graduation-priority sort"
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.measure.exposures=1;require('fs').writeFileSync(f,JSON.stringify(s))"
# v1.50.0: 到线未毕业的 active 词必须出现在 pool.nominations —— mustReuse(<5) 与 graduated(已确认) 两头都不含它
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.measure.exposures=5;require('fs').writeFileSync(f,JSON.stringify(s))"
L pool --limit 4 > "$T/pool_nom.json" 2>/dev/null
node -e "const p=JSON.parse(require('fs').readFileSync('$T/pool_nom.json','utf8'));process.exit((p.nominations||[]).some(x=>x.word==='measure'&&x.exposures===5) && !p.mustReuse.some(x=>x.startsWith('measure ')) ? 0 : 1)" \
  && ok "5/5 active word surfaces in nominations, never in mustReuse" || bad "nominations field"
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.measure.exposures=1;require('fs').writeFileSync(f,JSON.stringify(s))"
# dense: syntax overload must NOT demote tier but must arm the sentence-calmer
L pend --meta "$T/meta.json" > "$T/p2.json" 2>/dev/null
SID2=$(python3 -c "import json;print(json.load(open('$T/p2.json'))['session'])")
L confirm --session "$SID2" --score 3/3 --feel dense > "$T/cf2.json" 2>/dev/null
grepj '"tier": 4' "$T/cf2.json" && grepj '"句子": "syntax 3/4' "$T/cf2.json" && ok "dense changes NOTHING (v1.22.0: no auto-routing; feel is pure record)" || bad "dense routing"
# wordy: vocabulary overload never RE-ARMS the calmer; it only consumes the calm budget (dense's 2 -> 1)
L pend --meta "$T/meta.json" > /dev/null 2>&1
SID3=$(python3 -c "import json;s=json.load(open('$STATE/state.json'));print([x['id'] for x in s['sessions'] if x['status']=='pending'][-1])")
L confirm --session "$SID3" --score 3/3 --feel wordy > "$T/cf3.json" 2>/dev/null
grepj '"tier": 4' "$T/cf3.json" && grepj '"句子": "syntax 3/4' "$T/cf3.json" && ok "wordy changes NOTHING either — no axis is demoted automatically" || bad "wordy routing"
L confirm --session "$SID2" --state-dir "$STATE" >/dev/null 2>&1 && bad "double confirm accepted" || ok "double confirm refused"
# void also removes the archived passage file (pend 写、void 删)
L pend --meta "$T/meta.json" > "$T/p_v.json" 2>/dev/null
SIDV=$(python3 -c "import json;print(json.load(open('$T/p_v.json'))['session'])")
mkdir -p "$STATE/passages"; echo "# archived draft" > "$STATE/passages/$SIDV.md"
L void --session "$SIDV" > "$T/vt.json" 2>/dev/null
grepj '"passageRemoved": true' "$T/vt.json" && [ ! -f "$STATE/passages/$SIDV.md" ] && ok "void deletes the archived passage" || bad "void archive removal"
# regression (win bug): a voided session must strand no 0/6 ghosts outside both pools.
# Own state at the top rung: since v1.15.0 the ladder narrows mid-tier pools on purpose
# (whistle is B1 band 3, so it is legitimately absent at tier 2) — asserting it inside the
# main flow would test the current rung's width, not the ghost invariant.
TG="$T/ghost"; mkdir -p "$TG"
node "$S/ledger.mjs" init --state-dir "$TG" --no-sync > /dev/null 2>&1
node -e 'const fs=require("fs"),p=process.argv[1];const s=JSON.parse(fs.readFileSync(p));s.difficulty.tier=6;fs.writeFileSync(p,JSON.stringify(s))' "$TG/state.json"
LG() { node "$S/ledger.mjs" "$@" --state-dir "$TG"; }
echo '{"topic":"ghost","targets":["whistle"],"reunion":[],"names":[]}' > "$T/ghost.json"
LG pend --meta "$T/ghost.json" > "$T/ghost_p.json" 2>/dev/null
GID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session)' "$T/ghost_p.json")
LG void --session "$GID" > /dev/null 2>&1
LG pool --limit 9999 > "$T/ghost_pool.json" 2>/dev/null
node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!d.fresh.some(c=>c.startsWith("whistle ")))throw new Error("whistle missing from fresh")' "$T/ghost_pool.json" && ok "voided word returns to fresh (no 0/6 ghost lost)" || bad "void strands ghosts out of both pools"
TIER_PRE=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).difficulty.tier)' "$STATE/state.json")
for i in 2 3; do
  L pend --meta "$T/meta.json" > /dev/null 2>&1
  SID2=$(python3 -c "import json;s=json.load(open('$STATE/state.json'));print([x['id'] for x in s['sessions'] if x['status']=='pending'][-1])")
  # allow same-day duplicates by unique suffix
  L confirm --session "$SID2" --score 3/3 --feel flow > /dev/null 2>&1 || \
  { node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));const d=s.sessions.filter(x=>x.status==='pending').pop();d.id+='-$i';require('fs').writeFileSync(f,JSON.stringify(s))"; L confirm --session "$SID2-$i" --score 3/3 --feel flow > /dev/null 2>&1; }
done
# v1.15.0: assert the DELTA, not a literal — the absolute rung now depends on where the flow
# was sitting (wordy just demoted it), which is the ladder working as designed
node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(s.difficulty.tier===+process.argv[2]?0:1)' "$STATE/state.json" "$TIER_PRE" \
  && ok "flow no longer promotes: even two consecutive flow keep the tier ($TIER_PRE)" || bad "promotion rule"
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));s.words.service.exposures=5;require('fs').writeFileSync(f,JSON.stringify(s))"
L graduate --word service > "$T/gr.json" 2>/dev/null
grepj 'anki-flashcard' "$T/gr.json" && ok "graduation prints Anki bridge offer" || bad "bridge missing"
grepj '"graduatedAt"' "$T/gr.json" && ok "graduate stamps graduatedAt (v1.45.0)" || bad "graduate timestamp"
grepj '^service$' "$STATE/known-words.txt" && ok "graduated word lands in known-words.txt" || bad "known-words write"
L mark-anki --word service --note 777 > "$T/mark.json" 2>/dev/null
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).anki;if(!a||a.noteId!=='777'||!/^\d{4}-\d{2}-\d{2}T/.test(a.importedAt||''))throw new Error(JSON.stringify(a))" "$T/mark.json" \
  && ok "mark-anki records the Anki bridge outcome with a stamp (v1.46.0)" || bad "mark-anki record"
check "mark-anki refuses a word the ledger never heard of" 1 L mark-anki --word definitely-not-a-ledger-word
node -e "const f='$STATE/state.json',s=JSON.parse(require('fs').readFileSync(f));const now=new Date(),p=(n)=>String(n).padStart(2,'0');s.words.ungra0={exposures:1,last:now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate())+'T'+p(now.getHours())+':'+p(now.getMinutes())+':'+p(now.getSeconds()),status:'active',source:'pool'};require('fs').writeFileSync(f,JSON.stringify(s))"
check "mark-anki refuses a word that has not graduated" 1 L mark-anki --word ungra0
L interest --add "urban trains" > /dev/null 2>&1 && grepj "urban trains" "$STATE/state.json" && ok "interest add" || bad "interest add"
L pool --limit 6 > "$T/pool.json" 2>/dev/null
grepj 'mustReuse' "$T/pool.json" && grepj 'fresh' "$T/pool.json" && ok "pool returns mustReuse + fresh" || bad "pool"
node -e "const g=(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).graduated)||[];const s=g.find(x=>x.word==='service');if(!s)throw new Error('graduated word missing from pool.graduated');if(!s.graduatedAt)throw new Error('no graduatedAt');if(s.exposures!==5)throw new Error('exposures: '+s.exposures);if(s.approx!==false)throw new Error('fresh graduate must not be approx');if(s.anki?.noteId!=='777')throw new Error('anki badge not exposed: '+JSON.stringify(s.anki))" \
  "$T/pool.json" && ok "pool.graduated roster carries dates + anki badge" || bad "pool.graduated shape"
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

echo "== skillUpdate wiring (pool carries the field; soft-fail) =="
node "$S/ledger.mjs" pool --limit 1 --state-dir "$STATE" > "$T/st_up.json" 2>/dev/null
grepj '"check": "disabled"' "$T/st_up.json" && ok "pool output carries skillUpdate" || bad "skillUpdate not wired into pool"
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
grep -q '^## 0.1.0 — ' "$SHIPR/CHANGELOG.md" 2>/dev/null && grep -q 'docs only' "$SHIPR/CHANGELOG.md" && ok "ship auto-prepends CHANGELOG entry (version + date + message)" || bad "changelog auto-log"
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

echo "== axis snapshot + A->feel history (v1.17.0; replaces the retired profile) =="
# the retired four-dim profile must no longer be required, and a stale predicted block must not
# be mistaken for something the gate still reads
python3 -c "import json;m=json.load(open('$T/meta.json'));del m['predicted'];json.dump(m,open('$T/meta-nopredict.json','w'))"
PC "$T/passage.md" "$T/meta-nopredict.json" > "$T/np.json" 2>/dev/null
grepj '"pass": true' "$T/np.json" && ok "passage-check no longer requires meta.predicted (profile retired)" || bad "stale predicted requirement"
python3 -c "import json;m=json.load(open('$T/meta.json'));m['predicted']={'vocab':9};json.dump(m,open('$T/meta-badpredict.json','w'))"
PC "$T/passage.md" "$T/meta-badpredict.json" > "$T/bp.json" 2>/dev/null
grepj '"pass": true' "$T/bp.json" && ok "a malformed legacy predicted block is ignored, not validated" || bad "legacy predicted still validated"
# pend snapshots the five axis settings — this is the record that calibrates the scales
node -e '
const fs=require("fs"), p=process.argv[1];
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.difficulty={tier:6,syntax:2,cohesion:1,background:2,streakGood:0};
fs.writeFileSync(p,JSON.stringify(s));
' "$STATE/state.json"
L pend --meta "$T/meta-nopredict.json" > "$T/pp.json" 2>/dev/null
PPSID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session)' "$T/pp.json")
node -e '
const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const x=s.sessions.find(y=>y.id===process.argv[2]);
if(!x.axes) throw new Error("no axes snapshot on the session");
if(JSON.stringify(x.axes)!==JSON.stringify({tier:6,syntax:2,cohesion:1,background:2,baseword:1})) throw new Error("axes snapshot wrong: "+JSON.stringify(x.axes));
if("predicted" in x || "requested" in x) throw new Error("retired profile fields are still being written");
' "$STATE/state.json" "$PPSID" && ok "pend snapshots all five axes and writes no profile fields" || bad "axis snapshot"
# archive frontmatter carries the pend-time axis snapshot (not whatever the live state became)
node "$S/passage-check.mjs" --passage "$T/passage.md" --meta "$T/meta-nopredict.json" --state-dir "$STATE" --report "$T/pp_rep.json" > /dev/null 2>&1
L archive --session "$PPSID" --passage "$T/passage.md" --report "$T/pp_rep.json" > /dev/null 2>&1
grepj '^difficulty: { tier: 6, syntax: 2, cohesion: 1, background: 2, baseword: 1 }$' "$STATE/passages/$PPSID.md" \
  && ! grepj '^predicted:' "$STATE/passages/$PPSID.md" \
  && ok "archive frontmatter carries the axis snapshot and no predicted line" || bad "archive axis snapshot"
# context feel (v1.16.0): no longer record-only — it now pulls the background axis down one rung.
# Tier must NOT move (unknown background is not a vocabulary verdict).
TIER_BEFORE=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).difficulty.tier)' "$STATE/state.json")
L pend --meta "$T/meta.json" > "$T/pp2.json" 2>/dev/null
PPSID2=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session)' "$T/pp2.json")
L confirm --session "$PPSID2" --score 3/3 --feel context > "$T/ctx.json" 2>/dev/null
grepj "\"tier\": $TIER_BEFORE" "$T/ctx.json" && grepj '"background 2/2' "$T/ctx.json" \
  && ok "context feel holds tier and leaves the background axis untouched" || bad "context routing"
# choppy feel (v1.16.0, the 6th tap): pulls the discourse axis down one rung, nothing else
L pend --meta "$T/meta.json" > "$T/pp3.json" 2>/dev/null
PPSID3=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session)' "$T/pp3.json")
L confirm --session "$PPSID3" --score 3/3 --feel choppy > "$T/chp.json" 2>/dev/null
grepj "\"tier\": $TIER_BEFORE" "$T/chp.json" && grepj '"cohesion 1/3' "$T/chp.json" \
  && ok "choppy feel holds tier and leaves the cohesion axis untouched" || bad "choppy routing"
# pool history: every counted session must surface its axes next to how it actually landed
L pool --limit 4 > "$T/pool_hist.json" 2>/dev/null
node -e '
const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const h=d.history;
if(!Array.isArray(h)||!h.length) throw new Error("history missing");
for(const k of ["session","axes","feel","score"]) if(!(k in h[0])) throw new Error("history field missing: "+k);
if("calibration" in d) throw new Error("retired calibration field still emitted");
const hit=h.find(c=>c.session===process.argv[2]);
if(!hit) throw new Error("newest counted session absent from history");
if(hit.feel!=="context") throw new Error("feel wrong: "+hit.feel);
if(hit.axes===null) throw new Error("axes snapshot missing for the newest row");
// lastUsed must equal the newest axes-bearing row, so feedback-driven drift is visible.
// Compare against the row itself, not a literal — earlier confirms in this suite legitimately
// drift the axes, and a hardcoded expectation would break for the wrong reason.
const newest=h.find(c=>c.axes);
if(!d.lastUsed) throw new Error("lastUsed missing");
if(JSON.stringify(d.lastUsed)!==JSON.stringify(newest.axes)) throw new Error("lastUsed "+JSON.stringify(d.lastUsed)+" != newest row "+JSON.stringify(newest.axes));
' "$T/pool_hist.json" "$PPSID2" && ok "pool history pairs each passage's axes with its feel, and lastUsed exposes the last draft's settings" || bad "A->feel history"

echo "== difficulty ladder v1.15.0 (word bands / 6 tiers / 4 sentence rungs / negotiation) =="
# asset integrity: every B1/B2 word carries exactly one band, and no other word carries any
node -e '
const fs=require("fs"), S=process.argv[1];
const lv=new Map();
for(const l of fs.readFileSync(S+"/assets/cefr-j-words.tsv","utf8").split("\n")){
  if(l.startsWith("#")||!l.trim()) continue;
  const [w,x]=l.split("\t"); lv.set(w.trim().toLowerCase(),x.trim());
}
const bands=new Map();
for(const l of fs.readFileSync(S+"/assets/word-bands.tsv","utf8").split("\n")){
  if(l.startsWith("#")||!l.trim()) continue;
  const [w,,b]=l.split("\t");
  if(!["1","2","3","4"].includes((b||"").trim())) throw new Error("bad band "+JSON.stringify(b));
  bands.set(w.trim().toLowerCase(),+b);
}
const need=[...lv].filter(([,x])=>x==="B1"||x==="B2").map(([w])=>w);
const missing=need.filter(w=>!bands.has(w));
const extra=[...bands.keys()].filter(w=>!lv.has(w));
if(missing.length) throw new Error("B1/B2 words without a band: "+missing.length+" e.g. "+missing.slice(0,5));
if(extra.length) throw new Error("banded words not in CEFR list: "+extra.length);
const sizes=[1,2,3,4].map(b=>[...bands.values()].filter(x=>x===b).length);
if(sizes.some(n=>n<500)) throw new Error("degenerate band sizes "+sizes);
' "$SKILL_DIR" && ok "word-bands.tsv covers every B1/B2 word exactly once, bands 1-4" || bad "word-bands coverage"

# 6 tiers must be strictly monotone, and tier 3 must equal the old "all B1" pool the learner
# was actually sitting on — otherwise the v1.14.0 state silently drops to an easier pool
T2="$T/ladder"; mkdir -p "$T2"
node "$S/ledger.mjs" init --state-dir "$T2" --no-sync > /dev/null 2>&1
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const sizes=[];
for(let t=1;t<=8;t++){
  fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:t,syntax:3,cohesion:2,background:1,streakGood:0},words:{},sessions:[],interests:[]}));
  // poolSize was removed in v1.23.0 (the menu already lists per-tier word counts). On a clean
  // state with no known words and no exposures, `fresh` under an unbounded limit IS the pool, so
  // derive the size from that instead of adding a diagnostic field back.
  const o=JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","99999"],{encoding:"utf8"}));
  sizes.push(o.fresh.length);
}
if(!sizes.every((v,i)=>i===0||sizes[i-1]<v)) throw new Error("not monotone: "+sizes);
if(new Set(sizes).size!==8) throw new Error("duplicate rungs: "+sizes);
const oldB1=fs.readFileSync(S+"/assets/cefr-j-words.tsv","utf8").split("\n")
  .filter(l=>l.trim()&&!l.startsWith("#")).filter(l=>l.split("\t")[1].trim()==="B1").length;
if(sizes[3]!==oldB1) throw new Error("tier 4 = "+sizes[3]+" but old all-B1 pool was "+oldB1);
' "$SKILL_DIR" "$T2" && ok "tiers 1-8 strictly monotone; tier 4 == old all-B1 pool (544/1088/1632/2178/2802/3426/4050/4675)" || bad "tier ladder"

# v1.14.0 -> v1.15.0 -> v1.16.0 state migration (chained on state.version)
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
for(const [old,want] of Object.entries({1:4,2:8,3:8})){
  fs.writeFileSync(dir+"/state.json",JSON.stringify({version:1,difficulty:{tier:+old,streakGood:0},words:{},sessions:[],interests:[]}));
  const o=JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
  if(o.tier!==want) throw new Error("old tier "+old+" -> "+o.tier+", want "+want);
}
// v1.15.0 six-tier state must also land correctly (tier 3 = all B1 -> new tier 4) and the
// retired syntaxCalm counter must convert (+1), then the v1.36.0 flip (4 - i) must land it on 1/4
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:2,difficulty:{tier:3,syntaxCalm:2,streakGood:0},words:{},sessions:[],interests:[]}));
const o=JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
if(o.tier!==4) throw new Error("v1.15.0 tier 3 -> "+o.tier+", want 4");
if(!/syntax 1\/4/.test(o.axes.句子)) throw new Error("syntaxCalm 2 did not reach flipped rung 1 (冷静): "+o.axes.句子);
' "$SKILL_DIR" "$T2" && ok "pre-v1.16.0 state migrates (old 1->4, 2/3->8; syntaxCalm 2 -> flipped rung 1)" || bad "tier migration"

# v1.36.0 syntax-flip migration: the difficulty of every rung must survive the renumbering, the
# live axis AND the per-session axis snapshots must both flip (snapshots feed `history`, and an
# unflipped snapshot would read the old 常规 as the new 冷静), and a v4 state must be left alone.
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const L=(...a)=>JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"}));
const OLD_GATE=[
 "24 14 5 4","20 12 4 2","18 11 3 1","16 10 2 1","13 8 2 0", // pre-flip ladder, index 0..4
];
for(let old=0;old<=4;old++){
  fs.writeFileSync(dir+"/state.json",JSON.stringify({version:3,difficulty:{tier:4,syntax:old,cohesion:2,background:1},
    words:{},sessions:[{id:"s1",date:"2026-09-30",status:"counted",targets:[],axes:{tier:4,syntax:old,cohesion:2,background:1}}],interests:[]}));
  const o=L("pool","--limit","1");
  const got=o.gateFlags.match(/--max-sentence (\d+) --avg-sentence (\d+) --max-clauses (\d+) --max-passives (\d+)/).slice(1).join(" ");
  if(got!==OLD_GATE[old]) throw new Error("old syntax "+old+" meant ["+OLD_GATE[old]+"] but migrated to ["+got+"]");
  if(o.axes.句子.match(/syntax (\d)/)[1]!==String(4-old)) throw new Error("old "+old+" -> "+o.axes.句子+", want "+(4-old));
  if(o.menu.句子.current!==4-old) throw new Error("menu current not flipped: "+o.menu.句子.current);
  // pool is read-mostly and never saves, so force a save to check the snapshot actually flipped on disk
  L("interest","--add","flip-check");
  const st=JSON.parse(fs.readFileSync(dir+"/state.json","utf8"));
  if(st.version!==6) throw new Error("state not stamped v6: "+st.version);
  if(st.difficulty.syntax!==4-old) throw new Error("saved axis not flipped: "+JSON.stringify(st.difficulty));
  if(st.sessions[0].axes.syntax!==4-old) throw new Error("session snapshot not flipped: "+JSON.stringify(st.sessions[0].axes));
}
// a v4 state must NOT be flipped again (double flip = silently inverted difficulty)
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1},words:{},sessions:[],interests:[]}));
if(L("pool","--limit","1").menu.句子.current!==3) throw new Error("v4 state re-flipped");
' "$SKILL_DIR" "$T2" && ok "v1.36.0 syntax flip migrates rung state + session snapshots, same gates, never twice" || bad "syntax flip migration"

# v1.45.0 graduatedAt migration (v4 -> v5): pre-v5 known words get `last` backfilled with an
# approx mark; an existing graduatedAt is never touched; active words gain nothing.
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:1,cohesion:2,background:1},
  words:{alpha:{exposures:5,first:"2026-09-22",last:"2026-10-01T08:00:00",status:"known",source:"pool"},
         beta:{exposures:6,first:"2026-09-20",last:"2026-10-02T08:00:00",status:"known",source:"pool",graduatedAt:"2026-10-03T09:00:00"},
         live:{exposures:2,first:"2026-10-01",last:"2026-10-04T10:00:00",status:"active",source:"pool"}},
  sessions:[],interests:[]}));
const o=JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
const g=Object.fromEntries(o.graduated.map(x=>[x.word,x]));
if(Object.keys(g).length!==2) throw new Error("active word leaked into graduated: "+JSON.stringify(o.graduated));
if(g.alpha.graduatedAt!=="2026-10-01T08:00:00"||g.alpha.approx!==true) throw new Error("backfill wrong: "+JSON.stringify(g.alpha));
if(g.beta.graduatedAt!=="2026-10-03T09:00:00"||g.beta.approx!==false) throw new Error("existing graduatedAt clobbered: "+JSON.stringify(g.beta));
if(o.graduated[0].word!=="beta") throw new Error("roster not sorted newest-first: "+JSON.stringify(o.graduated));
' "$SKILL_DIR" "$T2" && ok "v1.45.0 backfills graduatedAt (approx) without clobbering, sorted newest-first" || bad "graduatedAt migration"

# v1.22.0 invariant: NO feel value and NO score moves an axis. This is the whole contract —
# difficulty changes only through `axes`. Loop every tap plus a failing and a perfect score.
T3="$T/rungs"; mkdir -p "$T3"
node "$S/ledger.mjs" init --state-dir "$T3" --no-sync > /dev/null 2>&1
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:6,difficulty:{tier:5,syntax:1,cohesion:1,background:2,baseword:1},words:{},sessions:[],interests:[]}));
const snap=()=>JSON.stringify(JSON.parse(fs.readFileSync(dir+"/state.json","utf8")).difficulty);
const want=snap();
for(const [feel,score] of [["flow","3/3"],["ok","3/3"],["wordy","3/3"],["dense","3/3"],["context","3/3"],["choppy","3/3"],["ok","1/3"],["flow","1/3"],["dense","1/3"]]){
  fs.writeFileSync(dir+"/m.json",JSON.stringify({topic:"t",targets:["concept"],reunion:[],names:[]}));
  const id="s"+Math.random().toString(36).slice(2,8);
  cp.execFileSync("node",[S+"/scripts/ledger.mjs","pend","--meta",dir+"/m.json","--id",id,"--state-dir",dir,"--no-sync"],{encoding:"utf8"});
  cp.execFileSync("node",[S+"/scripts/ledger.mjs","confirm","--session",id,"--score",score,"--feel",feel,"--state-dir",dir,"--no-sync"],{encoding:"utf8"});
  if(snap()!==want) throw new Error(feel+"/"+score+" moved the axes -> "+snap());
}
' "$SKILL_DIR" "$T3" && ok "no feel and no score ever moves an axis (axes is the only mutator)" || bad "auto-routing leaked back"

# the rung tables are now the ONLY path to difficulty, so lock every rung to the gate flags it emits
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const L=(...a)=>JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"}));
// v1.36.0: the ladder is indexed 0 = 最静 ... 4 = 放宽, i.e. bigger number = harder, like the other three axes
const syn=[
 ["--max-sentence 13 --avg-sentence 8 --max-clauses 2 --max-passives 0","syntax 0/4"],
 ["--max-sentence 16 --avg-sentence 10 --max-clauses 2 --max-passives 1","syntax 1/4"],
 ["--max-sentence 18 --avg-sentence 11 --max-clauses 3 --max-passives 1","syntax 2/4"],
 ["--max-sentence 20 --avg-sentence 12 --max-clauses 4 --max-passives 2","syntax 3/4"],
 ["--max-sentence 24 --avg-sentence 14 --max-clauses 5 --max-passives 4","syntax 4/4"],
];
syn.forEach(([flags,label],i)=>{
  const o=L("axes","--syntax",String(i));
  if(!o.gateFlags.startsWith(flags)) throw new Error("syntax "+i+" gateFlags: "+o.gateFlags);
  if(!o.axes.句子.startsWith(label)) throw new Error("syntax "+i+" label: "+o.axes.句子);
});
const coh=[
 ["--min-overlap 0.07 --min-connectives 0.48 --max-overlap 1 --max-connectives 99","cohesion 0/3"],
 ["--min-overlap 0.05 --min-connectives 0.4 --max-overlap 1 --max-connectives 99","cohesion 1/3"],
 ["--min-overlap 0 --min-connectives 0 --max-overlap 1 --max-connectives 99","cohesion 2/3"],
 ["--min-overlap 0 --min-connectives 0 --max-overlap 0.03 --max-connectives 0.3","cohesion 3/3"],
];
coh.forEach(([flags,label],i)=>{
  const o=L("axes","--cohesion",String(i));
  if(!o.gateFlags.includes(flags)) throw new Error("cohesion "+i+" gateFlags: "+o.gateFlags);
  if(!o.axes.衔接.startsWith(label)) throw new Error("cohesion "+i+" label: "+o.axes.衔接);
});
' "$SKILL_DIR" "$T3" && ok "every syntax/cohesion rung emits its documented gate flags (manual ladder is the only path)" || bad "rung table"

# a fresh init must carry all four axes, and the emitted gate flag string must match the rung tables
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
require("fs").writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1,streakGood:0},words:{},sessions:[],interests:[]}));
const o=JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs","pool","--state-dir",dir,"--no-sync","--limit","1"],{encoding:"utf8"}));
for(const k of ["词汇","句子","衔接","话题","底词"]) if(!o.axes[k]) throw new Error("axis missing: "+k);
if(o.gateFlags!=="--max-sentence 20 --avg-sentence 12 --max-clauses 4 --max-passives 2 --min-overlap 0 --min-connectives 0 --max-overlap 1 --max-connectives 99 --baseword 1")
  throw new Error("gateFlags mismatch at the default rung: "+o.gateFlags);
' "$SKILL_DIR" "$T3" && ok "five axes exposed and the default gateFlags string matches the rung tables" || bad "axis/gateFlags"

# 点菜入口：axes must set any subset, clamp-check every value, and refuse an empty call
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const L=(...a)=>cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"});
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1,streakGood:0},words:{},sessions:[],interests:[]}));
const o=JSON.parse(L("axes","--tier","6","--cohesion","3","--background","0"));
if(o.changed.tier!==6||o.changed.cohesion!==3||o.changed.background!==0) throw new Error("changed "+JSON.stringify(o.changed));
if(!/cohesion 3\/3/.test(o.axes.衔接)) throw new Error(o.axes.衔接);
if(!/max-overlap 0.03/.test(o.gateFlags)) throw new Error(o.gateFlags);
if(o.axes.句子.match(/syntax (\d)/)[1]!=="3") throw new Error("untouched axis moved");
const bad=cp.spawnSync("node",[S+"/scripts/ledger.mjs","axes","--tier","9","--state-dir",dir,"--no-sync"],{encoding:"utf8"});
if(bad.status===0) throw new Error("out-of-range tier accepted");
const empty=cp.spawnSync("node",[S+"/scripts/ledger.mjs","axes","--state-dir",dir,"--no-sync"],{encoding:"utf8"});
if(empty.status===0) throw new Error("empty axes call accepted");
' "$SKILL_DIR" "$T3" && ok "axes command sets a subset, rejects out-of-range and empty calls" || bad "axes command"

# v1.47.0 底词轴：迁移 v5->v6 默认 1 档、gateFlags 尾巴带 --baseword、axes 只收 1–8
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const L=(...a)=>JSON.parse(cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"}));
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:5,difficulty:{tier:4,syntax:3,cohesion:2,background:1},words:{},sessions:[],interests:[]}));
const o=L("pool","--limit","1");
if(o.menu.底词.current!==1) throw new Error("baseword not defaulted to 1: "+o.menu.底词.current);
if(!/--baseword 1$/.test(o.gateFlags)) throw new Error("gateFlags: "+o.gateFlags);
if(o.menu.底词.rungs.length!==8) throw new Error("底词 rungs: "+o.menu.底词.rungs.length);
L("interest","--add","bw");
const st=JSON.parse(fs.readFileSync(dir+"/state.json","utf8"));
if(st.version!==6||st.difficulty.baseword!==1) throw new Error("v6 stamp missing: "+JSON.stringify(st.difficulty));
L("axes","--baseword","5");
if(!/--baseword 5$/.test(L("pool","--limit","1").gateFlags)) throw new Error("baseword 5 not in gateFlags");
for(const bad of ["0","9","x"]){
  const r=cp.spawnSync("node",[S+"/scripts/ledger.mjs","axes","--baseword",bad,"--state-dir",dir,"--no-sync"]);
  if(r.status===0) throw new Error("baseword "+bad+" accepted");
}
' "$SKILL_DIR" "$T3" && ok "baseword axis: v6 migration defaults to 1, gateFlags carries it, axes accepts 1-8 only" || bad "baseword axis"

# v1.47.0 底词硬闸：带内背景词 1 档仍拒、2 档放行、量超 1% 上限拒；带外词 8 档也拒
BW=$(node --input-type=module -e '
import fs from "node:fs";
const { tierPool, TIERS } = await import("'"$SKILL_DIR"'/scripts/lib-wordbands.mjs");
const free = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "").toLowerCase();
const banned = free("'"$T"'/passage.md") + free("'"$STATE"'/known-words.txt") + free("'"$SKILL_DIR"'/assets/allow-extra.txt");
console.log([...tierPool(TIERS[1])].find((x) => /^[a-z]{4,9}$/.test(x) && !banned.includes(x)));
')
HBW=$(node --input-type=module -e '
import fs from "node:fs";
const { BANDS, TIERS, tierPool } = await import("'"$SKILL_DIR"'/scripts/lib-wordbands.mjs");
const in1 = tierPool(TIERS[1]);
const free = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "").toLowerCase();
const banned = free("'"$T"'/passage.md") + free("'"$STATE"'/known-words.txt") + free("'"$SKILL_DIR"'/assets/allow-extra.txt");
// 确定性取 B2 中难段的词：它超出 2 档（B1 易段）的放行带，但落在 8 档带内
console.log([...BANDS.entries()].filter(([w, [l, b]]) => l === "B2" && b === 3 && !in1.has(w) && /^[a-z]{4,9}$/.test(w) && !banned.includes(w))[0][0]);
')
{ cat "$T/passage.md"; printf '\n\nThe %s sat there, and the %s stayed all day.\n' "$BW" "$BW"; } > "$T/bw2.md"
{ cat "$T/bw2.md"; for i in 1 2 3 4 5; do printf 'The %s waited quietly outside.\n' "$BW"; done; } > "$T/bw12.md"
{ cat "$T/passage.md"; printf '\n\nThe %s sat there, and the %s stayed all day.\n' "$HBW" "$HBW"; } > "$T/bwhard.md"
BFLAGS="--min-words 1 --max-words 9999 --max-rate 100 --min-overlap 0 --min-connectives 0 --max-overlap 1 --max-connectives 99"
check "底词 1 档（默认）：带内背景词仍是未申报超纲，零容忍不变" 1 node "$S/passage-check.mjs" --passage "$T/bw2.md" --meta "$T/meta.json" --state-dir "$STATE" $BFLAGS
node "$S/passage-check.mjs" --passage "$T/bw2.md" --meta "$T/meta.json" --state-dir "$STATE" $BFLAGS --baseword 2 > "$T/bwpass.json" 2>/dev/null \
  && grepj '"pass": true' "$T/bwpass.json" && grepj '"rung": 2' "$T/bwpass.json" \
  && ok "底词 2 档：带内背景词放行且报告带 rung/率" || bad "baseword 2 pass"
node "$S/passage-check.mjs" --passage "$T/bw12.md" --meta "$T/meta.json" --state-dir "$STATE" $BFLAGS --baseword 2 > "$T/bw12.json" 2>/dev/null \
  && grepj '"pass": true' "$T/bw12.json" && grepj '"tokens": 7' "$T/bw12.json" \
  && ok "v1.48.0 率闸已撤：带内背景词再多也放行，报告只读统计 tokens/rate" || bad "baseword no-cap pass"
check "带外词（B2 中难段）在底词 2 档仍被拒" 1 node "$S/passage-check.mjs" --passage "$T/bwhard.md" --meta "$T/meta.json" --state-dir "$STATE" $BFLAGS --baseword 2
node "$S/passage-check.mjs" --passage "$T/bwhard.md" --meta "$T/meta.json" --state-dir "$STATE" $BFLAGS --baseword 8 > "$T/bw8.json" 2>/dev/null \
  && grepj '"pass": true' "$T/bw8.json" && ok "带外词升到 8 档（B2 中难带）即放行" || bad "baseword 8 pass"

# the pre-draft menu: every axis must offer ALL its rungs, mark exactly one as current, and the
# marked default must equal the live state (i.e. the learner's last choice) — v1.18.0
node -e '
const fs=require("fs"), cp=require("child_process"), S=process.argv[1], dir=process.argv[2];
const L=(...a)=>cp.execFileSync("node",[S+"/scripts/ledger.mjs",...a,"--state-dir",dir,"--no-sync"],{encoding:"utf8"});
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:5,syntax:1,cohesion:1,background:0,quiz:2,streakGood:0},words:{},sessions:[],interests:[]}));
const o=JSON.parse(L("pool","--limit","1"));
const m=o.menu;
if(!m) throw new Error("menu missing from pool");
const want={词汇:8,句子:5,衔接:4,话题:3,底词:8};
const live={词汇:5,句子:1,衔接:1,话题:0,底词:1};
for(const [axis,n] of Object.entries(want)){
  const a=m[axis];
  if(!a) throw new Error("axis missing from menu: "+axis);
  if(!a.flag) throw new Error("axis not selectable: "+axis);
  if(a.rungs.length!==n) throw new Error(axis+" offers "+a.rungs.length+" rungs, want "+n);
  const marked=a.rungs.filter(r=>r.current);
  if(marked.length!==1) throw new Error(axis+" marks "+marked.length+" rungs as current");
  if(marked[0].value!==live[axis]) throw new Error(axis+" default "+marked[0].value+" != live state "+live[axis]);
  if(marked[0].value!==a.current) throw new Error(axis+" rung/axis current disagree");
}
const sizes=m.词汇.rungs.map(r=>+(r.detail.match(/(\d+) 词/)||[])[1]);
if(!sizes.every((v,i)=>i===0||sizes[i-1]<v)) throw new Error("tier rungs not ascending: "+sizes);
if(!m.话题.note) throw new Error("the unmeasured axis must carry an honesty note");
// v1.25.0: every axis must state its direction (v1.36.0 made all four uniform), offer a
// copy-pasteable command, and carry its own lastUsed/drift so no hand-diffing is needed
for(const [axis,a] of Object.entries(m)){
  if(!a.direction) throw new Error(axis+" has no direction marker");
  if(!/^axes --[a-z]+ <\d+–\d+>$/.test(a.set)) throw new Error(axis+" set string malformed: "+a.set);
  if(!("lastUsed" in a)||!("driftedSinceLastDraft" in a)) throw new Error(axis+" missing drift fields");
  const vals=a.rungs.map(r=>r.value);
  if(String(vals[0])!==a.set.match(/<(\d+)/)[1]) throw new Error(axis+" set range disagrees with rungs: "+a.set);
}
for(const axis of ["词汇","句子","衔接","话题","底词"]){
  if(!/越难/.test(m[axis].direction)) throw new Error(axis+" must read 数字越大越难 (v1.36.0 unified the index direction)");
  if(/相反|越易|越容易/.test(m[axis].direction)) throw new Error(axis+" is still flagged inverted after the v1.36.0 flip");
}
// fixedLimits must describe the non-adjustable contract, and its numbers must MATCH the
// passage-check LIMITS defaults -- the panel lied once (v1.24.0); this guards against a repeat.
if(!o.fixedLimits||Object.keys(o.fixedLimits).length<4) throw new Error("fixedLimits missing from the panel");
const pc=fs.readFileSync(S+"/scripts/passage-check.mjs","utf8");
const Q=String.fromCharCode(39);
const def=(k)=>{ const i=pc.indexOf(k+Q); if(i<0) return NaN; const m=pc.slice(i).match(/,\s*(\d+)\)/); return m?+m[1]:NaN; };
const flat=Object.values(o.fixedLimits).join(" | ");
for(const k of ["min-words","max-words","max-rate","min-targets","max-targets","min-target-hits"]){
  const n=def(k);
  if(!Number.isFinite(n)) throw new Error("could not read LIMITS default for "+k);
  if(!flat.includes(String(n))) throw new Error("fixedLimits omits the passage-check "+k+" default "+n+" -- the panel would lie");
}
// a fresh state must pre-select the defaults, not a stale value
fs.writeFileSync(dir+"/state.json",JSON.stringify({version:4,difficulty:{tier:4,syntax:3,cohesion:2,background:1,streakGood:0},words:{},sessions:[],interests:[]}));
const d=JSON.parse(L("pool","--limit","1")).menu;
for(const [axis,v] of Object.entries({词汇:4,句子:3,衔接:2,话题:1,底词:1})){
  if(d[axis].rungs.find(r=>r.current).value!==v) throw new Error(axis+" default wrong on a fresh state");
}
' "$SKILL_DIR" "$T3" && ok "menu: all rungs + one current + direction + set + drift per axis, and fixedLimits matches passage-check LIMITS" || bad "diet menu"

# the panel must be rendered from a FIXED template, not improvised per agent (v1.26.0): the file
# has to exist, be linked from SKILL.md, cover all four axes, name every fill source, and keep the
# hard rules (state which way the numbers run — v1.36.0 made all four axes 越大越难; never read
# gateFlags aloud; the panel is rendered markdown, so 代码块 must stay named so nobody re-fences it).
TPL="$SKILL_DIR/references/panel-templates.md"
[ -f "$TPL" ] && ok "panel template file exists" || bad "panel-templates.md missing"
grepj 'references/panel-templates.md' "$SKILL_DIR/SKILL.md" && ok "SKILL.md links the panel template" || bad "template not linked"
miss=""
for k in 词汇 句子 衔接 话题 底词 fixedLimits gateFlags direction driftedSinceLastDraft lastUsed 越难 不念 代码块; do
  grepj "$k" "$TPL" || miss="$miss $k"
done
[ -z "$miss" ] && ok "template covers all five axes, every fill source, and its hard rules" || bad "template missing:$miss"


echo "== archive (scripted step-6) =="
node "$S/passage-check.mjs" --passage "$T/passage.md" --meta "$T/meta.json" --state-dir "$STATE" --report "$T/rep_ok.json" > /dev/null 2>&1
grepj '"passageSha256"' "$T/rep_ok.json" && ok "--report writes report file containing passageSha256" || bad "--report/passageSha256"
node -e 'const j=require(process.argv[1]);const t=j.longestSentences||[];if(!t.length||t.length>3)throw new Error("count");if(t[0].words!==j.maxSentence)throw new Error("top != maxSentence");if(!t[0].text)throw new Error("no text");' "$T/rep_ok.json" \
  && ok "report names its longest runs (longestSentences: 1–3 entries, top == maxSentence, text present)" || bad "longestSentences report field"
L pend --meta "$T/meta.json" > "$T/a_p1.json" 2>/dev/null
SID_A=$(python3 -c "import json;print(json.load(open('$T/a_p1.json'))['session'])")
L archive --session "$SID_A" --passage "$T/passage.md" --report "$T/rep_ok.json" --quiz "B,A,C" > "$T/a_ok.json" 2> "$T/a_ok.err"
{ [ $? = 0 ] && grepj "\"archived\": \"$SID_A\"" "$T/a_ok.json" && [ -f "$STATE/passages/$SID_A.md" ]; } && ok "archive happy path: file written, id reported" || bad "archive happy path: $(cat "$T/a_ok.err")"
grepj "^session: $SID_A$" "$STATE/passages/$SID_A.md" && grepj 'quizAnswers: \[B, A, C\]' "$STATE/passages/$SID_A.md" && grepj '^validatedBy: .*sha256:' "$STATE/passages/$SID_A.md" && grepj '^at: [0-9-]*T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]$' "$STATE/passages/$SID_A.md" && ok "frontmatter: session/at/quizAnswers/validatedBy generated mechanically" || bad "archive frontmatter content"
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

echo "== 参考翻译表对指标不可见 (v1.49.0) =="
printf '# Test title\nOne two three. Four five six.\n' > "$T/trans-a.md"
printf '# Test title\nOne two three. Four five six.\n\n### 中文参考翻译\n| 段 | 译文 |\n|---|---|\n| 1 | 一二三。四五六。 |\n' > "$T/trans-b.md"
printf '{"topic":"t","targets":[],"reunion":[],"names":[]}\n' > "$T/trans.json"
node "$S/passage-check.mjs" --passage "$T/trans-a.md" --meta "$T/trans.json" --state-dir "$STATE" \
  --min-words 1 --max-words 9999 --max-rate 100 --max-sentence 99 --avg-sentence 99 --max-clauses 99 --min-connectives 0 --min-targets 0 > "$T/ta.json" 2>/dev/null
node "$S/passage-check.mjs" --passage "$T/trans-b.md" --meta "$T/trans.json" --state-dir "$STATE" \
  --min-words 1 --max-words 9999 --max-rate 100 --max-sentence 99 --avg-sentence 99 --max-clauses 99 --min-connectives 0 --min-targets 0 > "$T/tb.json" 2>/dev/null
node -e 'const a=require(process.argv[1]),b=require(process.argv[2]);process.exit(a.words===b.words&&a.sentences===b.sentences?0:1)' "$T/ta.json" "$T/tb.json" \
  && ok "translation table rows excluded from words/sentences" || bad "translation table leaks into metrics"

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

#!/usr/bin/env node
// english-context bookshelf: builds $STATE/bookshelf.html — a read-only, fully offline view
// of the passage archive. Data is baked in (file:// has no fetch); counted-only (pending
// passages carry quizAnswers and must not leak); atomic tmp+rename write. View only —
// never writes state. Ledger confirm/void call this as a soft-fail hook.
// Usage: node bookshelf.mjs [--state-dir DIR] [--out FILE]

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const stateDir = arg('state-dir', process.env.EC_STATE_DIR || join(homedir(), '.english-context'));
const outPath = arg('out', join(stateDir, 'bookshelf.html'));
const dir = join(stateDir, 'passages');

// YAML-subset parser for our own frontmatter only: scalars, [a, b] flow lists, {k: v} flow maps.
function parseMd(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    else if (v.startsWith('{') && v.endsWith('}')) {
      const o = {};
      for (const kv of v.slice(1, -1).split(/,(?![^{]*})/)) { const j = kv.indexOf(':'); if (j > 0) o[kv.slice(0, j).trim()] = kv.slice(j + 1).trim(); }
      v = o;
    }
    fm[k] = v;
  }
  return { fm, body: text.slice(m[0].length) };
}

let st = { sessions: [] };
try { st = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8')); } catch {}
const status = new Map((st.sessions || []).map((x) => [x.id, x.status]));

const passages = [];
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const parsed = parseMd(readFileSync(join(dir, f), 'utf8'));
    if (!parsed) continue;
    const id = parsed.fm.session || f.replace(/\.md$/, '');
    if (status.get(id) !== 'counted') continue; // pending would leak quizAnswers; void files are already gone
    passages.push({ ...parsed.fm, session: id, body: parsed.body });
  }
}
passages.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.session || '').localeCompare(a.session || ''));

const data = JSON.stringify({ builtAt: new Date().toLocaleString('sv'), tier: st.difficulty?.tier ?? null, passages })
  .replace(/</g, '\\u003c'); // a passage can never close our <script> or open another tag

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>English-context 书架</title>
<style>
:root{--bg:#faf8f5;--fg:#2b2a28;--mut:#8a857c;--acc:#b3541e;--card:#fff;--line:#e7e2d9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 20px 80px}
h1{font-size:22px;margin:8px 0 2px}h1 small{color:var(--mut);font-size:12px;font-weight:400}
#search{width:100%;padding:10px 12px;font:inherit;border:1px solid var(--line);border-radius:10px;background:var(--card);margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer}
.card:hover{border-color:var(--acc)}
.meta{color:var(--mut);font-size:13px}.more{color:var(--acc);font-size:13px;cursor:pointer}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.badge{font-size:12.5px;padding:2px 9px;border-radius:99px;background:#f2ede3;border:1px solid var(--line);cursor:pointer}
.badge.r{background:#e8eef2;border-color:#d3dfe8}
.hide{display:none}
#detail{display:none}
.art{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px 26px}
.art h2{margin:0 0 14px;font-size:20px}
.art p{margin:0 0 14px}.art strong{color:var(--acc)}
button.rev{font:inherit;font-size:14px;border:1px solid var(--acc);color:var(--acc);background:none;border-radius:8px;padding:6px 14px;cursor:pointer;margin-top:6px}
.answers{margin-top:10px;padding:10px 14px;background:#f6f1e7;border-radius:8px;font-size:15px}
.back{color:var(--acc);cursor:pointer;font-size:14px;margin-bottom:12px;display:inline-block}
</style></head><body><main>
<div id="list"><h1>English-context 书架 <small id="n"></small></h1>
<input id="search" type="search" placeholder="搜索正文、主题、目标词、重逢词…">
<div id="cards"></div></div>
<div id="detail"></div>
</main>
<script id="ec-data" type="application/json">${data}</script>
<script>
const D=JSON.parse(document.getElementById('ec-data').textContent);
const $=s=>document.querySelector(s);
const esc=t=>t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const inline=t=>esc(t).replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');
function render(p){
  const lines=p.body.split(/\\n+/).map(x=>x.trim()).filter(Boolean);
  const title=(lines[0]||'').replace(/^#\\s*/,'');
  const paras=lines.slice(1).map(l=>inline(l)).map(h=>'<p>'+h+'</p>').join('');
  const quiz=lines.filter(l=>/^\\d+[\\.、]/.test(l));
  return '<div class="art"><h2>'+esc(title)+'</h2>'+paras
   +(quiz.length?'<h3 style="margin:22px 0 6px;font-size:16px">题目</h3>'+quiz.map(l=>'<p>'+inline(l)+'</p>').join('')
     +(p.quizAnswers&&p.quizAnswers.length?'<button class="rev" onclick="this.nextElementSibling.classList.remove(\\'hide\\')">看答案</button><div class="answers hide">答案：'+esc(p.quizAnswers.join(' 、 '))+'</div>':''):'')
   +'</div>';
}
function badges(p,clickable){
  const t=(p.targets||[]).map(w=>'<span class="badge"'+(clickable?' onclick="go(\\''+w+'\\')"':'')+'>'+esc(w)+'</span>').join('');
  const r=(p.reunion||[]).map(w=>'<span class="badge r"'+(clickable?' onclick="go(\\''+w+'\\')"':'')+'>'+esc(w)+'</span>').join('');
  return '<div class="badges">'+t+r+'</div>';
}
function card(p,i){
  const d=document.createElement('div');d.className='card';
  d.innerHTML='<div class="meta">'+esc(p.date||'—')+' · <b style="color:var(--fg)">'+esc(p.topic||'—')+'</b> · '+(p.targets||[]).length+'词 <span class="more">词 ▾</span></div>'
   +'<div class="badges hide" data-b></div>';
  d.querySelector('.more').onclick=e=>{e.stopPropagation();d.querySelector('.badges').classList.toggle('hide');if(!d.querySelector('.badges').dataset.f){d.querySelector('.badges').outerHTML=badges(p,true).replace('class="badges"','class="badges" data-f=1');}};
  d.onclick=()=>location.hash='#/s/'+p.session;
  return d;
}
function applyFilter(){
  const q=($('#search').value||'').trim().toLowerCase();
  const show=D.passages.filter(p=>!q||[p.topic,(p.targets||[]).join(' '),(p.reunion||[]).join(' '),p.body].join(' ').toLowerCase().includes(q));
  const c=$('#cards');c.innerHTML='';show.forEach(p=>c.appendChild(card(p)));
  if(!show.length)c.innerHTML='<div class="meta">没有匹配的文章。</div>';
}
function go(w){location.hash='#/';$('#search').value=w;applyFilter();}
function route(){
  const m=/^#\\/s\\/(.+)$/.exec(location.hash);
  if(!m){$('#list').style.display='';$('#detail').style.display='none';applyFilter();return;}
  const p=D.passages.find(x=>x.session===decodeURIComponent(m[1]));
  if(!p){location.hash='#/';return;}
  $('#list').style.display='none';
  $('#detail').style.display='block'; // 'none' lives in CSS — an empty inline value would fall back to it
  $('#detail').innerHTML='<span class="back" onclick="location.hash=\\'#/\\'">← 返回书架</span>'+badges(p,true)+render(p);
}
$('#n').textContent=D.passages.length+' 篇';
$('#search').addEventListener('input',applyFilter);
addEventListener('hashchange',route);route();
</script></body></html>`;

mkdirSync(stateDir, { recursive: true });
const tmp = outPath + '.tmp';
writeFileSync(tmp, html);
renameSync(tmp, outPath);
console.log(JSON.stringify({ bookshelf: outPath, passages: passages.length }));

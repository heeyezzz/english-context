#!/usr/bin/env node
// Read-only pull of learned words from the 微语境闪卡 deck via Agent Connect/AnkiConnect.
// Never writes to Anki. Output: {"deck":..., "words":[...]} to stdout, or --out <file>.

const URL_ = process.env.ANKI_CONNECT_URL || 'http://127.0.0.1:8766';
const DECK = process.env.EC_ANKI_DECK || 'all in one::微语境闪卡';
const WORD_FIELD = process.env.EC_WORD_FIELD || 'Word';

async function rpc(action, params = {}) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${URL_}`);
  const j = await res.json();
  if (j.error) throw new Error(`AnkiConnect ${action}: ${j.error}`);
  return j.result;
}

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
try {
  const ids = await rpc('findNotes', { query: `deck:"${DECK}"` });
  const words = [];
  for (let i = 0; i < ids.length; i += 200) {
    const notes = await rpc('notesInfo', { notes: ids.slice(i, i + 200) });
    for (const n of notes) {
      const w = n.fields?.[WORD_FIELD]?.value?.replace(/<[^>]+>/g, '').trim();
      if (w) words.push(w.toLowerCase());
    }
  }
  const payload = { deck: DECK, count: words.length, words };
  const text = JSON.stringify(payload, null, 2);
  if (out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, text);
    console.error(`wrote ${words.length} words to ${out}`);
  } else {
    console.log(text);
  }
} catch (e) {
  console.error(`Anki endpoint unavailable (${e.message}). Open Anki with Agent Connect/AnkiConnect, or pass --out to a file saved from another session.`);
  process.exit(1);
}

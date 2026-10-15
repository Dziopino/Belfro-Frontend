import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

// Odczytuje mapy ToUnicode z wygenerowanego PDF-a i sprawdza, czy polskie znaki mają odwzorowanie.
const file = process.argv[2];
const text = readFileSync(file).toString('latin1');

const wanted = {
  ą: 0x0105, Ć: 0x0106, ę: 0x0119, ł: 0x0142, ń: 0x0144, ó: 0x00f3, ś: 0x015b, ź: 0x017a, ż: 0x017c,
  '”': 0x201d, '„': 0x201e, '–': 0x2013, '—': 0x2014, '…': 0x2026, '•': 0x2022,
};

const codes = new Set();
let bfcharBlocks = 0;

for (const match of text.matchAll(/stream\r?\n?([\s\S]*?)endstream/g)) {
  const raw = Buffer.from(match[1], 'latin1');
  let body;
  try {
    body = zlib.inflateSync(raw).toString('latin1');
  } catch {
    body = raw.toString('latin1');
  }

  for (const block of body.split('beginbfchar').slice(1)) {
    const cmap = block.split('endbfchar')[0];
    if (!cmap) continue;
    bfcharBlocks += 1;

    for (const line of cmap.split('\n')) {
      const pair = line.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      if (!pair) continue;
      for (let i = 0; i + 4 <= pair[2].length; i += 4) {
        codes.add(parseInt(pair[2].slice(i, i + 4), 16));
      }
    }
  }
}

console.log(`plik: ${file.split(/[\\/]/).pop()}`);
console.log(`znaleziono ${bfcharBlocks} bloków bfchar, ${codes.size} odwzorowań CID→Unikod`);

const missing = Object.entries(wanted).filter(([, code]) => !codes.has(code)).map(([glyph]) => glyph);
const mapped = [...codes].filter((code) => code > 0x7f && code < 0x3000).sort((a, b) => a - b).map((code) => String.fromCharCode(code)).join('');
console.log(`odwzorowane znaki spoza ASCII: ${mapped || '—'}`);
console.log(missing.length === 0 ? 'WSZYSTKIE polskie glify mają odwzorowanie' : `brakuje z listy oczekiwanych: ${missing.join(' ')}`);
process.exitCode = missing.length === 0 && bfcharBlocks > 0 ? 0 : 1;

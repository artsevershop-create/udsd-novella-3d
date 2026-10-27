// Generates data/apartments.json with SAMPLE sales data (the same statuses and prices the demo used to compute in code).
// Replace the file with the developer's export (or a CRM adapter's output) in the same format; see docs/TZ.md.
// Usage: node tools/gen-apartments.js
const fs = require('fs');
const path = require('path');

// floors per section, copied from QUARTERS in demo/index.html: sections 1-4 north wing, 5-8 south, 9-10 east, 11-12 west
const QUARTERS = [
  { n: [12, 12, 9, 9], s: [6, 6, 5, 5], e: [8, 8], w: [7, 9] },
  { n: [9, 12, 12, 9], s: [5, 6, 6, 5], e: [9, 7], w: [7, 9] },
  { n: [12, 10, 9, 8], s: [7, 6, 5, 5], e: [6, 8], w: [8, 10] },
  { n: [10, 12, 12, 10], s: [6, 5, 5, 7], e: [7, 6], w: [9, 8] },
  { n: [11, 12, 10, 9], s: [5, 6, 7, 6], e: [8, 9], w: [6, 7] }
];
const TYPES = { a: { rooms: 3, area: 72.6, face: 1 }, b: { rooms: 1, area: 42.2, face: 1 }, c: { rooms: 2, area: 61.4, face: -1 }, d: { rooms: 0, area: 33.6, face: -1 } };
const LETTERS = ['a', 'b', 'c', 'd'];
const OWN = { quarter: 2, section: 2, floor: 8, type: 'a' };   // the apartment with the 3D interior is always on sale

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const price = (f, l) => { const t = TYPES[l], rate = 292000 + f * 2200 + (t.face === 1 ? 7000 : 0); return Math.round(t.area * rate / 10000) * 10000; };

const apartments = [];
let si = 0;   // global section index: the old generator hashed it
QUARTERS.forEach((q, qi) => {
  q.n.concat(q.s, q.e, q.w).forEach((floors, k) => {
    for (let f = 2; f <= floors; f++) LETTERS.forEach((l, li) => {
      const own = qi + 1 === OWN.quarter && k + 1 === OWN.section && f === OWN.floor && l === OWN.type;
      const r = hash(si + ':' + f + l), status = own ? 'free' : r < 0.52 ? 'sold' : r < 0.62 ? 'reserved' : 'free';
      apartments.push({ quarter: qi + 1, section: k + 1, floor: f, number: (f - 2) * 4 + li + 1, type: l, rooms: TYPES[l].rooms, area: TYPES[l].area, price: price(f, l), status: status });
    });
    si++;
  });
});

const out = {
  sample: true,
  source: 'Пример для демо 3dryad.ru: статусы и цены сгенерированы, это не данные продаж УДС-Д',
  updated: new Date().toISOString().slice(0, 10),
  currency: 'RUB',
  apartments: apartments
};
const file = path.resolve(__dirname, '..', 'data', 'apartments.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
// one apartment per line: readable in a diff, small enough for a phone (Pages serves it gzipped)
const body = JSON.stringify(out, null, 2).replace(/"apartments": \[[\s\S]*\]/, '"apartments": [\n' + apartments.map((a) => '    ' + JSON.stringify(a)).join(',\n') + '\n  ]');
fs.writeFileSync(file, body + '\n');
console.log(apartments.length + ' apartments -> ' + path.relative(process.cwd(), file));

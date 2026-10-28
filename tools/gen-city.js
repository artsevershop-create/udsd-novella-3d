// Builds demo/city.js: outlines of Novy Urengoy (districts, the northern and southern parts of the city, rivers, main roads)
// from OpenStreetMap via the Overpass API. Data © OpenStreetMap contributors, ODbL — the demo shows the attribution.
// Usage: node tools/gen-city.js   (needs Node 18+ for fetch)
//
// Scene coordinates: metres, origin near the real ЖК «Новелла» (OSM way "Жилой комплекс «Новелла»"), x ≈ east, z ≈ south,
// turned by ROT so that ул. Мира runs along +x as in the demo's quarter layout (the real street runs ~19° south of east).
const fs = require('fs');
const path = require('path');

const LAT0 = 66.12535, LON0 = 76.65513;        // centre of the OSM outline of ЖК «Новелла»
const DZ = -19;                                  // shift so the real ул. Мира lands on the demo's ул. Мира (z ≈ -104)
const BB = '65.93,76.45,66.16,76.85';            // the city itself; Korotchaevo and Limbyayakha are tens of km away
const KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KZ = 110574;

const query = `[out:json][timeout:120];
(
  nwr["place"~"^(suburb|quarter|neighbourhood)$"](${BB});
  way["landuse"="residential"]["name"](${BB});
  relation["landuse"="residential"]["name"](${BB});
  way["highway"~"^(trunk|primary|secondary)$"](${BB});
  way["waterway"="river"]["name"~"^(Седэяха|Евояха)$"](${BB});
  way["highway"]["name"="улица Мира"](${BB});
);
out geom;`;

const proj0 = (p) => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KZ];
let ROT = 0;
const proj = (p) => { const [x, z] = proj0(p), c = Math.cos(-ROT), s = Math.sin(-ROT); return [x * c - z * s, x * s + z * c + DZ]; };

// Douglas–Peucker on [x, z] points; a closed ring is split at its farthest point first (both ends coincide)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const f = pts[0], l = pts[pts.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.5) {
    let fi = 1, fd = 0; pts.forEach((p, i) => { const d = Math.hypot(p[0] - f[0], p[1] - f[1]); if (d > fd) { fd = d; fi = i; } });
    return simplify(pts.slice(0, fi + 1), tol).slice(0, -1).concat(simplify(pts.slice(fi), tol));
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = (pts) => pts.flatMap((p) => [Math.round(p[0]), Math.round(p[1])]);
// the map extent around the complex: both parts of the city with a margin (Overpass returns whole rivers and roads)
const EXT = { x0: -5500, x1: 6500, z0: -3000, z1: 8000 };
const inside = (p) => p[0] > EXT.x0 && p[0] < EXT.x1 && p[1] > EXT.z0 && p[1] < EXT.z1;
function clip(pts) {   // split a polyline into the runs that lie inside EXT
  const runs = []; let cur = [];
  pts.forEach((p) => { if (inside(p)) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } });
  if (cur.length > 1) runs.push(cur); return runs;
}

// outer ring of a way or a multipolygon relation (outer members joined end to end)
function ring(e) {
  if (e.type === 'way') return e.geometry;
  const segs = e.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.slice());
  if (!segs.length) return null;
  const out = segs.shift(), same = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
  while (segs.length) {
    const end = out[out.length - 1]; let i = segs.findIndex((s) => same(s[0], end) || same(s[s.length - 1], end));
    if (i < 0) break; const s = segs.splice(i, 1)[0]; if (!same(s[0], end)) s.reverse(); out.push(...s.slice(1));
  }
  return out;
}
function hull(points) {   // convex hull (monotone chain)
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  p.forEach((q) => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  p.slice().reverse().forEach((q) => { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const centroid = (pts) => { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; };
const grow = (pts, m) => { const c = centroid(pts); return pts.map((p) => { const dx = p[0] - c[0], dz = p[1] - c[1], L = Math.hypot(dx, dz) || 1; return [p[0] + dx / L * m, p[1] + dz / L * m]; }); };

(async () => {
  // public Overpass servers are often busy: try mirrors with growing pauses
  const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  async function overpass(q) {
    let wait = 5000;
    for (let attempt = 0; attempt < 6; attempt++) {
      const url = SERVERS[attempt % SERVERS.length];
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': '3dryad-novella-demo/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        if (r.ok) return (await r.json()).elements; console.log(url, r.status);
      } catch (e) { console.log(url, e.message); }
      await new Promise((res) => setTimeout(res, wait)); wait *= 2;
    }
    throw new Error('Overpass servers are unavailable, try again later');
  }
  const els = await overpass(query);

  // rotation: direction of ул. Мира between its west end and its bend east of the complex
  const mira = els.filter((e) => e.type === 'way' && e.tags.name === 'улица Мира').flatMap((e) => e.geometry.map(proj0)).filter((p) => Math.abs(p[0]) < 900 && Math.abs(p[1]) < 400);
  mira.sort((a, b) => a[0] - b[0]);
  const a = mira[0], b = mira[mira.length - 1]; ROT = Math.atan2(b[1] - a[1], b[0] - a[0]);

  const seen = new Set(), districts = [];
  const isDistrict = (n) => /^(микрорайон |квартал |посёлок |\d+-й микрорайон|ЖК |Жилой комплекс )/.test(n) && !/Новелл/.test(n);
  els.forEach((e) => {
    const t = e.tags || {}, n = t.name; if (!n || seen.has(n)) return;
    const zone = t.place === 'suburb' && /зона|промзона/.test(n);
    if (!isDistrict(n) && !zone) return;
    const g = ring(e); if (!g || g.length < 4) return;
    const pts = simplify(g.map(proj), 6);
    if (pts.length < 4 || !pts.every(inside)) return;   // e.g. микрорайон Уралец, 9 km west, outside the map
    seen.add(n);
    districts.push([n.replace('Жилой комплекс ', 'ЖК ').replace(/"([^"]+)"/g, '«$1»'), zone ? 'zone' : 'res', flat(pts)]);
  });

  // the two parts of the city: hull of the residential districts north and south of the Sedeyakha valley
  const res = districts.filter((d) => d[1] === 'res').map((d) => { const p = []; for (let i = 0; i < d[2].length; i += 2) p.push([d[2][i], d[2][i + 1]]); return p; });
  const north = res.filter((p) => centroid(p)[1] < 2500).flat(), south = res.filter((p) => centroid(p)[1] >= 2500).flat();
  const parts = [['Новый Уренгой · Северная часть', flat(grow(hull(north), 60))], ['Новый Уренгой · Южная часть', flat(grow(hull(south), 60))]];

  const lines = (filter, tol) => els.filter(filter).flatMap((e) => clip(e.geometry.map(proj)).map((run) => flat(simplify(run, tol)))).filter((l) => l.length >= 4);
  const rivers = {}; els.filter((e) => e.type === 'way' && e.tags.waterway).forEach((e) => { clip(e.geometry.map(proj)).forEach((run) => (rivers[e.tags.name] = rivers[e.tags.name] || []).push(flat(simplify(run, 12)))); });
  const roads = lines((e) => e.type === 'way' && /^(trunk|primary|secondary)$/.test(e.tags.highway || ''), 10);

  const out = {
    src: '© участники OpenStreetMap',
    note: 'Контуры по OpenStreetMap на ' + new Date().toISOString().slice(0, 10) + '; карта повёрнута на ' + (ROT * 180 / Math.PI).toFixed(1) + '° вслед за ул. Мира',
    rot: +(ROT * 180 / Math.PI).toFixed(2), districts, parts, rivers: Object.entries(rivers), roads
  };
  const file = path.resolve(__dirname, '..', 'demo', 'city.js');
  fs.writeFileSync(file, '// Generated by tools/gen-city.js from OpenStreetMap (© OpenStreetMap contributors, ODbL). Do not edit by hand.\nwindow.CITY = ' + JSON.stringify(out) + ';\n');
  console.log('rot', out.rot, '° · districts', districts.length, '· rivers', out.rivers.map((r) => r[0] + ' ' + r[1].length).join(', '), '· roads', roads.length, '·', fs.statSync(file).size, 'bytes');

  // the city's buildings as plain blocks (demo/buildings.json, loaded after the first frame): outline + height, no architecture.
  // Garages, sheds, tanks and roofs are left out; height from building:levels, otherwise a typical value for the kind.
  const bq = `[out:json][timeout:180];way["building"~"^(apartments|residential|house|detached|yes|commercial|retail|office|school|kindergarten|college|university|hospital|public|civic|dormitory|hotel|industrial|warehouse|sports_hall|church)$"](${BB});out geom;`;
  const bels = await overpass(bq);
  const OWN = { x0: -560, x1: 360, z0: -240, z1: 240 };   // our modelled quarters: the real outlines there are not drawn
  const areaOf = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(s / 2); };
  const KIND_H = { apartments: 15, residential: 15, dormitory: 12, house: 6, detached: 6, school: 9, kindergarten: 7, college: 12, university: 12, hospital: 12, industrial: 8, warehouse: 7 };
  const blds = [];
  bels.forEach((e) => {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) return;
    const pts = simplify(e.geometry.map(proj), 2); if (pts.length < 4) return;
    const ring = pts.slice(0, -1); if (ring.length < 3) return;
    const c = centroid(ring), A = areaOf(ring);
    if (A < 120 || !inside(c) || (c[0] > OWN.x0 && c[0] < OWN.x1 && c[1] > OWN.z0 && c[1] < OWN.z1)) return;
    const t = e.tags || {}, lv = parseFloat(t['building:levels']);
    const h = lv > 0 && lv < 40 ? lv * 3 : (KIND_H[t.building] || (A > 900 ? 15 : A > 300 ? 9 : 5));
    blds.push([Math.round(h)].concat(flat(ring)));
  });
  const bfile = path.resolve(__dirname, '..', 'demo', 'buildings.json');
  fs.writeFileSync(bfile, JSON.stringify({ src: '© участники OpenStreetMap', note: 'Здания по OpenStreetMap, без архитектуры: контур и высота (этажность из OSM или типовая)', b: blds }));
  console.log('buildings', blds.length, 'of', bels.length, '·', fs.statSync(bfile).size, 'bytes');
})().catch((e) => { console.error(e.message); process.exit(1); });

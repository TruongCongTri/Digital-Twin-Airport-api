/**
 * @file scripts/osm-long-thanh.mjs
 * @description Derives Long Thanh (VVLT) geometry from OpenStreetMap - the same data the
 * basemap's 3D buildings are built from - so sensors and stands line up with the 3D terminal:
 *   - terminal outline (aeroway=terminal "Nhà ga T1") and runway centrelines / areas
 *   - aircraft stands: ~38 m out from real OSM gates, perpendicular to each pier, on an apron
 *   - indoor sensor anchors: points in the central hall with the most clearance from walls
 *   - outdoor sensor anchors: beside both ends of runway 05R/23L and on the main apron
 * Writes the same TypeScript data file into the API and web repos.
 *
 * Usage: node scripts/osm-long-thanh.mjs [cached-overpass.json]
 * Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)
 */
import fs from 'node:fs';
import path from 'node:path';

const OUTPUTS = [
  'src/constants/long-thanh-osm.ts',
  '../Digital-Twin-Airport-web/constants/long-thanh-osm.ts',
];

const QUERY = `[out:json][timeout:60];(way["aeroway"~"terminal|runway|apron"](10.74,106.98,10.84,107.10);node["aeroway"="gate"](10.74,106.98,10.84,107.10););out geom;`;

const loadOsm = async (cached) => {
  if (cached) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'digital-twin-airport/1.0' },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return res.json();
};

// --- local metric frame ---
const LAT0 = 10.775;
const LON0 = 107.04;
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const toXY = (p) => ({ x: (p.lon - LON0) * M_LON, y: (p.lat - LAT0) * M_LAT });
const toGeo = (p) => ({ lat: +(LAT0 + p.y / M_LAT).toFixed(7), lng: +(LON0 + p.x / M_LON).toFixed(7) });
const geoProps = (p) => {
  const g = toGeo(p);
  return `lat: ${g.lat}, lng: ${g.lng}`;
};
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => mul(a, 1 / (len(a) || 1));

const inside = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const segDist = (p, a, b) => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x ** 2 + ab.y ** 2 || 1)));
  return { d: len(sub(p, add(a, mul(ab, t)))), t, foot: add(a, mul(ab, t)) };
};
const edgeClearance = (p, poly) => {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length]).d);
  return m;
};
// Clockwise ring (ArcGIS fill requirement): signed area < 0 in x-east / y-north means clockwise
const clockwise = (poly) => {
  const area = poly.reduce((s, p, i) => s + (poly[(i + 1) % poly.length].x - p.x) * (poly[(i + 1) % poly.length].y + p.y), 0);
  return area > 0 ? poly : [...poly].reverse();
};

// Pier axes = the original T1 / T2 / T3 parking lines (pier centrelines) from airport-coordinates.ts
const PIERS = {
  T1: [{ lat: 10.775865210048106, lon: 107.04276367590793 }, { lat: 10.777973131582414, lon: 107.04343959253568 }],
  T2: [{ lat: 10.775116894353356, lon: 107.03930899092178 }, { lat: 10.7774145338134, lon: 107.03760310609943 }],
  T3: [{ lat: 10.772102533423862, lon: 107.03768893678232 }, { lat: 10.772070914093357, lon: 107.03527494882616 }],
};
const STAND_OFFSET_M = 38;
const STANDS_PER_PIER = 5;

const main = async () => {
  const osm = await loadOsm(process.argv[2]);
  const ways = osm.elements.filter((e) => e.type === 'way');
  const terminalWay = ways.find((e) => e.tags?.aeroway === 'terminal');
  const aprons = ways.filter((e) => e.tags?.aeroway === 'apron').map((e) => e.geometry.map(toXY));
  const runways = ways.filter((e) => e.tags?.aeroway === 'runway');
  const gates = osm.elements.filter((e) => e.type === 'node' && e.tags?.aeroway === 'gate').map((g) => ({ ...toXY(g), ref: g.tags.ref }));
  if (!terminalWay || !runways.length || !gates.length) throw new Error('OSM response is missing terminal / runways / gates');

  const terminal = terminalWay.geometry.map(toXY);

  // --- Runways: farthest pair of points = the two thresholds; area = 45 m wide strip ---
  const runwayData = runways.map((r) => {
    const pts = r.geometry.map(toXY);
    let best = [pts[0], pts[1]];
    for (const a of pts) for (const b of pts) if (len(sub(a, b)) > len(sub(best[0], best[1]))) best = [a, b];
    const [a, b] = best[0].x < best[1].x ? best : [best[1], best[0]]; // a = SW end
    const dir = norm(sub(b, a));
    const side = { x: -dir.y, y: dir.x };
    const half = 22.5;
    const area = clockwise([add(a, mul(side, half)), add(b, mul(side, half)), add(b, mul(side, -half)), add(a, mul(side, -half))]);
    return { ref: r.tags.ref, start: a, end: b, dir, side, area };
  });

  // --- Stands from gates ---
  const stands = {};
  for (const [pier, [p0, p1]] of Object.entries(PIERS)) {
    const a = toXY(p0);
    const b = toXY(p1);
    const candidates = gates
      .map((g) => ({ g, ...segDist(g, a, b) }))
      .filter((c) => c.d > 5 && c.d < 45) // gates on this pier's façades
      .map((c) => ({ ...c, stand: add(c.g, mul(norm(sub(c.g, c.foot)), STAND_OFFSET_M)) }))
      .filter((c) => aprons.some((ap) => inside(c.stand, ap)) && !inside(c.stand, terminal))
      .sort((m, n) => m.t - n.t);
    if (candidates.length < STANDS_PER_PIER) throw new Error(`Only ${candidates.length} apron stands for ${pier}`);
    const picked = Array.from({ length: STANDS_PER_PIER }, (_, i) =>
      candidates[Math.round((i * (candidates.length - 1)) / (STANDS_PER_PIER - 1))]
    );
    stands[pier] = picked.map((c) => toGeo(c.stand));
  }

  // --- Indoor anchors: max wall clearance, >= 110 m apart ---
  const xs = terminal.map((p) => p.x);
  const ys = terminal.map((p) => p.y);
  const grid = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 8) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 8) {
      const p = { x, y };
      if (inside(p, terminal)) grid.push({ p, c: edgeClearance(p, terminal) });
    }
  }
  grid.sort((m, n) => n.c - m.c);
  const indoor = [];
  for (const cand of grid) {
    if (indoor.length === 3) break;
    if (indoor.every((q) => len(sub(q.p, cand.p)) >= 110)) indoor.push(cand);
  }

  // --- Outdoor anchors: beside both ends of 05R/23L (250 m in, 70 m off the centreline) + main apron ---
  const rwy = runwayData.find((r) => r.ref === '05R/23L') ?? runwayData[0];
  const apronMain = aprons.reduce((big, ap) => (ap.length > big.length ? ap : big), aprons[0]);
  const apronCentre = apronMain.reduce((s, p) => add(s, mul(p, 1 / apronMain.length)), { x: 0, y: 0 });
  const outdoor = [
    { name: `RWY ${rwy.ref.split('/')[0]} threshold`, p: add(add(rwy.start, mul(rwy.dir, 250)), mul(rwy.side, 70)) },
    { name: `RWY ${rwy.ref.split('/')[1]} threshold`, p: add(add(rwy.end, mul(rwy.dir, -250)), mul(rwy.side, 70)) },
    { name: 'Main apron', p: inside(apronCentre, apronMain) ? apronCentre : apronMain[0] },
  ];

  const fmtPts = (pts) => `[\n${pts.map((p) => `    { lat: ${p.lat}, lng: ${p.lng} },`).join('\n')}\n  ]`;
  const body = `// Generated by Digital-Twin-Airport-api/scripts/osm-long-thanh.mjs - do not edit by hand.
// Long Thanh (VVLT) geometry derived from OpenStreetMap, the data behind the basemap's 3D buildings.
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)
// Generated: ${new Date().toISOString().slice(0, 10)}

/** Terminal "${terminalWay.tags.name ?? 'T1'}" outline (OSM way ${terminalWay.id}), clockwise */
export const LONG_THANH_TERMINAL_AREA = ${fmtPts(clockwise(terminal).map(toGeo))};

/** Runways (OSM), SW threshold -> NE threshold, with a 45 m wide clockwise area */
export const LONG_THANH_RUNWAYS = {
${runwayData
  .map(
    (r) => `  "${r.ref}": {
    start: { ${geoProps(r.start)} },
    end: { ${geoProps(r.end)} },
    area: ${fmtPts(r.area.map(toGeo)).replace(/\n/g, '\n  ')},
  },`
  )
  .join('\n')}
};

/** Aircraft stands per pier: ${STAND_OFFSET_M} m out from OSM gates, on the apron */
export const LONG_THANH_STANDS = {
${Object.entries(stands)
  .map(([pier, pts]) => `  ${pier}: ${fmtPts(pts).replace(/\n/g, '\n  ')},`)
  .join('\n')}
};

/** Indoor sensor anchors (central hall, wall clearance in metres) */
export const LONG_THANH_INDOOR_ANCHORS = [
${indoor.map((a) => `  { ${geoProps(a.p)}, clearanceM: ${Math.round(a.c)} },`).join('\n')}
];

/** Outdoor sensor anchors */
export const LONG_THANH_OUTDOOR_ANCHORS = [
${outdoor.map((a) => `  { name: ${JSON.stringify(a.name)}, ${geoProps(a.p)} },`).join('\n')}
];
`;

  for (const out of OUTPUTS) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
    console.log(`✅ wrote ${out}`);
  }
  console.log('stands', Object.fromEntries(Object.entries(stands).map(([k, v]) => [k, v.length])));
  console.log('indoor clearance (m)', indoor.map((a) => Math.round(a.c)).join(', '));
  console.log('runways', runwayData.map((r) => r.ref).join(', '));
};

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

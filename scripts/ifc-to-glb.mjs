/**
 * @file scripts/ifc-to-glb.mjs
 * @description Converts an IFC model into a lightweight GLB the web map can render with ArcGIS.
 * Reads IFC4 ReferenceView tessellation (IfcTriangulatedFaceSet, already in site coordinates)
 * and IFC2x3 Coordination View geometry (extruded solids, face-based surface models and mapped
 * items, positioned through their IfcLocalPlacement chain and scaled from the file's length unit).
 *
 * - Meshes are merged into one primitive per material (timber, steel, glass, concrete, ...),
 *   or per IfcSurfaceStyle colour when the geometry carries one.
 * - Coordinates stay in the IFC site frame (metres, origin = model origin); IFC Z-up is
 *   converted to glTF Y-up as (x, y, z) -> (x, z, -y).
 * - Elements entirely below ground (footings, grade beams) are skipped.
 * - Toposolids and planting go to a separate "Site" layer instead of the storey that hosts them.
 * - Normals are omitted: glTF viewers compute flat normals, which suits this blocky model
 *   and roughly halves the file size.
 *
 * Usage:
 *   node scripts/ifc-to-glb.mjs <input.ifc> <output.glb>   -> one GLB for the whole model
 *   node scripts/ifc-to-glb.mjs <input.ifc> <output-dir>   -> one GLB per IfcBuildingStorey
 *                                                            + manifest.json (for level isolation)
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/ifc-to-glb.mjs <input.ifc> <output.glb | output-dir>');
  process.exit(1);
}
const splitByStorey = !outputPath.toLowerCase().endsWith('.glb');

// --- 1. PARSE STEP ENTITIES ---
const entities = new Map();
const text = fs.readFileSync(inputPath, 'utf8');
for (const raw of text.split(/;\r?\n/)) {
  const match = /^#(\d+)\s*=\s*([A-Z0-9]+)\((.*)\)$/s.exec(raw.trim());
  if (match) entities.set(Number(match[1]), { type: match[2], args: match[3] });
}

const deref = (token) => entities.get(Number(token.trim().replace('#', '')));

// Length unit of the file (Revit IFC2x3 exports in millimetres); geometry is written in metres
const lengthUnit = [...entities.values()].find((e) => e.type === 'IFCSIUNIT' && e.args.includes('.LENGTHUNIT.'));
const UNIT_SCALE = lengthUnit?.args.includes('.MILLI.') ? 0.001 : 1;

// Decodes STEP string escapes (\X\E0 = à, \X2\1EAF\X0\ = ắ)
const decodeIfc = (s) =>
  s
    .replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/g, (_, hex) => String.fromCharCode(...hex.match(/.{4}/g).map((h) => parseInt(h, 16))))
    .replace(/\\X\\([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

// Full STEP argument parser: refs -> { ref }, typed values -> { type, value }, $ and * -> null
const parseArgs = (s) => {
  let i = 0;
  const value = () => {
    if (s[i] === '(') {
      i++;
      const list = [];
      while (s[i] !== ')') {
        list.push(value());
        if (s[i] === ',') i++;
      }
      i++;
      return list;
    }
    if (s[i] === "'") {
      let out = '';
      i++;
      while (!(s[i] === "'" && s[i + 1] !== "'")) {
        out += s[i];
        i += s[i] === "'" ? 2 : 1;
      }
      i++;
      return out;
    }
    const start = i;
    while (i < s.length && !',()'.includes(s[i])) i++;
    const token = s.slice(start, i);
    if (s[i] === '(') return { type: token, value: value()[0] };
    if (token[0] === '#') return { ref: Number(token.slice(1)) };
    if (token === '$' || token === '*') return null;
    return token[0] === '.' ? token : Number(token);
  };
  const out = [];
  while (i < s.length) {
    out.push(value());
    if (s[i] === ',') i++;
  }
  return out;
};
const argsCache = new Map();
const argsOf = (id) => {
  if (!argsCache.has(id)) argsCache.set(id, parseArgs(entities.get(id).args));
  return argsCache.get(id);
};
const typeOf = (id) => entities.get(id)?.type;

// Element id -> storey id, from IfcRelContainedInSpatialStructure
const storeyOf = new Map();
const storeys = new Map(); // storey id -> { name, elevation }
for (const [id, e] of entities) {
  if (e.type === 'IFCBUILDINGSTOREY') {
    const name = /^'[^']*',[^,]*,'([^']*)'/.exec(e.args)?.[1] ?? `Storey ${id}`;
    const elevation = Number(e.args.split(',').pop()) * UNIT_SCALE;
    storeys.set(id, { name, elevation });
  }
}
for (const e of entities.values()) {
  if (e.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue;
  const [, elementList, structure] = /\((#[\d,#]+)\),(#\d+)$/.exec(e.args) ?? [];
  if (!elementList) continue;
  const storeyId = Number(structure.slice(1));
  for (const ref of elementList.split(',')) storeyOf.set(Number(ref.slice(1)), storeyId);
}
const parseNumbers = (s) => (s.match(/-?\d+(\.\d*)?(E[-+]?\d+)?/gi) || []).map(Number);

// --- 1b. PLACEMENTS (column-major 4x4 matrices) ---
const multiply = (a, b) => {
  const out = new Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[col * 4 + k], 0);
    }
  return out;
};
const transform = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const point = (ref) => argsOf(ref.ref)[0];

const axisPlacement = (id) => {
  const [location, zRef, xRef] = argsOf(id);
  const [x, y, z = 0] = point(location);
  if (typeOf(id) === 'IFCAXIS2PLACEMENT2D') {
    const dir = zRef ? point(zRef) : [1, 0];
    return [dir[0], dir[1], 0, 0, -dir[1], dir[0], 0, 0, 0, 0, 1, 0, x, y, 0, 1];
  }
  const zAxis = zRef ? point(zRef) : [0, 0, 1];
  const xAxis = xRef ? point(xRef) : [1, 0, 0];
  const yAxis = cross(zAxis, xAxis);
  return [...xAxis, 0, ...yAxis, 0, ...zAxis, 0, x, y, z, 1];
};
const localPlacement = (id) => {
  const [parent, relative] = argsOf(id);
  const own = axisPlacement(relative.ref);
  return parent ? multiply(localPlacement(parent.ref), own) : own;
};

// --- 1c. PROFILES (closed 2D loops; curves are sampled) ---
const ARC_STEP = Math.PI / 24;
const circlePoints = (radius, from, to) => {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / ARC_STEP));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [radius * Math.cos(t), radius * Math.sin(t)];
  });
};

// A trim is a parameter (radians, Revit's plane angle unit) or a point on the circle
const trimAngle = (trim, placement) => {
  const param = trim.find((t) => t?.type === 'IFCPARAMETERVALUE');
  if (param) return param.value;
  const [x, y] = point(trim.find((t) => t?.ref));
  const dx = x - placement[12];
  const dy = y - placement[13];
  return Math.atan2(dx * placement[4] + dy * placement[5], dx * placement[0] + dy * placement[1]);
};

const curvePoints = (id) => {
  const type = typeOf(id);
  const args = argsOf(id);
  if (type === 'IFCPOLYLINE') return args[0].map((ref) => point(ref).slice(0, 2));
  if (type === 'IFCCOMPOSITECURVE') {
    const loop = [];
    for (const segment of args[0]) {
      const [, sameSense, parent] = argsOf(segment.ref);
      const pts = curvePoints(parent.ref);
      if (sameSense === '.F.') pts.reverse();
      for (const p of pts) {
        const last = loop[loop.length - 1];
        if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) loop.push(p);
      }
    }
    return loop;
  }
  if (type === 'IFCTRIMMEDCURVE') {
    const [basis, trim1, trim2, sense] = args;
    if (typeOf(basis.ref) !== 'IFCCIRCLE') throw new Error(`Unsupported trimmed curve #${id}`);
    const [position, radius] = argsOf(basis.ref);
    const m = axisPlacement(position.ref);
    const from = trimAngle(trim1, m);
    let to = trimAngle(trim2, m);
    if (sense === '.T.') while (to < from) to += 2 * Math.PI;
    else while (to > from) to -= 2 * Math.PI;
    return circlePoints(radius, from, to).map(([x, y]) => transform(m, [x, y, 0]).slice(0, 2));
  }
  throw new Error(`Unsupported curve ${type} #${id}`);
};

const profilePoints = (id) => {
  const type = typeOf(id);
  const args = argsOf(id);
  let pts;
  let position = args[2];
  if (type === 'IFCRECTANGLEPROFILEDEF') {
    const [w, h] = [args[3] / 2, args[4] / 2];
    pts = [[-w, -h], [w, -h], [w, h], [-w, h]];
  } else if (type === 'IFCCIRCLEPROFILEDEF') {
    pts = circlePoints(args[3], 0, 2 * Math.PI).slice(0, -1);
  } else if (type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
    pts = curvePoints(args[2].ref);
    position = null;
  } else throw new Error(`Unsupported profile ${type} #${id}`);
  if (position) {
    const m = axisPlacement(position.ref);
    pts = pts.map(([x, y]) => transform(m, [x, y, 0]).slice(0, 2));
  }
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts = pts.slice(0, -1);
  return pts;
};

// Ear clipping: profiles can be concave (curved walls). Returns index triples.
const triangulate = (pts) => {
  const area2 = pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const ccw = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const order = pts.map((_, i) => i);
  if (area2 < 0) order.reverse();
  const tris = [];
  while (order.length > 3) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const [ia, ib, ic] = [order[(i + order.length - 1) % order.length], order[i], order[(i + 1) % order.length]];
      const [a, b, c] = [pts[ia], pts[ib], pts[ic]];
      if (ccw(a, b, c) <= 0) continue;
      const blocked = order.some(
        (j) =>
          j !== ia && j !== ib && j !== ic &&
          ccw(a, b, pts[j]) >= 0 && ccw(b, c, pts[j]) >= 0 && ccw(c, a, pts[j]) >= 0
      );
      if (blocked) continue;
      tris.push([ia, ib, ic]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate leftovers (collinear sliver)
  }
  if (order.length === 3) tris.push(order);
  return tris;
};

// Item id -> [r, g, b, a] from IfcStyledItem -> IfcSurfaceStyleRendering
const itemColours = new Map();
for (const [id, e] of entities) {
  if (e.type !== 'IFCSTYLEDITEM') continue;
  const [item, assignments] = argsOf(id);
  if (!item) continue;
  const surfaceStyle = argsOf(assignments[0].ref)[0][0];
  const rendering = argsOf(surfaceStyle.ref)[2].map((ref) => ref.ref).find((r) => typeOf(r) === 'IFCSURFACESTYLERENDERING');
  if (!rendering) continue;
  const [colour, transparency] = argsOf(rendering);
  const [, r, g, b] = argsOf(colour.ref);
  itemColours.set(item.ref, [r, g, b, 1 - (transparency ?? 0)]);
}

// Meshes of one representation item in the product's coordinate space
const itemMeshes = (id, m, colour) => {
  const type = typeOf(id);
  const args = argsOf(id);
  const own = itemColours.get(id) ?? colour;
  if (type === 'IFCMAPPEDITEM') {
    const [source, target] = args;
    const [origin, mapped] = argsOf(source.ref);
    const [, , localOrigin, scale] = argsOf(target.ref);
    const t = point(localOrigin);
    const k = scale ?? 1;
    const operator = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, t[0], t[1], t[2] ?? 0, 1];
    const placed = multiply(multiply(m, operator), axisPlacement(origin.ref));
    return argsOf(mapped.ref)[3].flatMap((item) => itemMeshes(item.ref, placed, own));
  }
  if (type === 'IFCEXTRUDEDAREASOLID') {
    const [profile, position, direction, depth] = args;
    const loop = profilePoints(profile.ref);
    const place = multiply(m, axisPlacement(position.ref));
    const dir = point(direction);
    const offset = dir.map((v) => v * depth);
    const bottom = loop.map(([x, y]) => transform(place, [x, y, 0]));
    const top = loop.map(([x, y]) => transform(place, [x + offset[0], y + offset[1], offset[2]]));
    const n = loop.length;
    const indices = [];
    for (const [a, b, c] of triangulate(loop)) indices.push(a, c, b, a + n, b + n, c + n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(i, j, j + n, i, j + n, i + n);
    }
    return [{ positions: [...bottom, ...top], indices, colour: own }];
  }
  if (type === 'IFCFACEBASEDSURFACEMODEL') {
    const positions = [];
    const indices = [];
    const seen = new Map(); // shared polyloop vertices stay shared, which keeps trees small
    const vertex = (ref) => {
      if (!seen.has(ref.ref)) {
        seen.set(ref.ref, positions.length);
        positions.push(transform(m, point(ref)));
      }
      return seen.get(ref.ref);
    };
    for (const shell of args[0]) {
      for (const face of argsOf(shell.ref)[0]) {
        const bound = argsOf(argsOf(face.ref)[0][0].ref)[0];
        const loop = argsOf(bound.ref)[0];
        for (let i = 1; i < loop.length - 1; i++) indices.push(vertex(loop[0]), vertex(loop[i]), vertex(loop[i + 1]));
      }
    }
    return [{ positions, indices, colour: own }];
  }
  return [];
};

// Body meshes of a product that has no tessellated geometry
const productMeshes = (entityId) => {
  const args = argsOf(entityId);
  const placementRef = args[5]?.ref;
  const shapeRef = args[6]?.ref;
  if (!placementRef || !shapeRef) return [];
  const m = localPlacement(placementRef);
  const bodies = argsOf(shapeRef)[2].map((r) => argsOf(r.ref)).filter((rep) => rep[1] === 'Body');
  return bodies.flatMap((rep) => rep[3].flatMap((item) => itemMeshes(item.ref, m)));
};

// --- 2. MATERIALS ---
// [r, g, b, a] in linear-ish sRGB; alpha < 1 renders blended
const MATERIALS = {
  timberRoof: [0.78, 0.62, 0.43, 1],
  timber: [0.56, 0.39, 0.23, 1],
  steel: [0.62, 0.64, 0.67, 1],
  glass: [0.55, 0.74, 0.86, 0.35],
  concrete: [0.86, 0.86, 0.84, 1],
  tower: [0.93, 0.93, 0.92, 1],
  water: [0.3, 0.6, 0.85, 0.8],
  foliage: [0.3, 0.47, 0.25, 1],
};

// One material per distinct IFC surface colour
const colourMaterial = (colour) => {
  const name = `ifc-${colour.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
  MATERIALS[name] = colour;
  return name;
};

const pickMaterial = (type, name) => {
  const n = name.toLowerCase();
  if (type === 'IFCCURTAINWALL' || n.includes('glass') || type === 'IFCDOOR') return 'glass';
  if (n.includes('pool') || n.includes('fountain')) return 'water';
  if (n.startsWith('rpc tree')) return 'foliage';
  if (type === 'IFCROOF') return 'timberRoof';
  if (n.includes('timber') || n.includes('rafter') || n.includes('branching')) return 'timber';
  if (type === 'IFCBUILDINGELEMENTPROXY') return 'tower';
  if (n.startsWith('str ') || n.includes('mullion') || n.includes('transom') || n.includes('antenna') || type === 'IFCRAILING')
    return 'steel';
  return 'concrete';
};

const PRODUCT_TYPES = new Set([
  'IFCSLAB', 'IFCROOF', 'IFCBEAM', 'IFCMEMBER', 'IFCCURTAINWALL', 'IFCCOLUMN', 'IFCFOOTING',
  'IFCBUILDINGELEMENTPROXY', 'IFCDOOR', 'IFCRAILING', 'IFCWALL', 'IFCWALLSTANDARDCASE',
]);
const isSiteElement = (name) => /^(toposolid|rpc )/i.test(name);

// --- 3. COLLECT GEOMETRY PER (STOREY,) MATERIAL ---
const newBuckets = () => Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, { positions: [], indices: [] }]));
const groups = new Map(); // group key -> buckets
let elementCount = 0;
let skipped = 0;

for (const [entityId, entity] of entities) {
  if (!PRODUCT_TYPES.has(entity.type)) continue;
  const name = /^'[^']*',[^,]*,'([^']*)'/.exec(entity.args)?.[1] ?? '';
  const groupKey = !splitByStorey
    ? 'model'
    : isSiteElement(decodeIfc(name))
      ? 'site'
      : (storeyOf.get(entityId) ?? 'site');
  if (!groups.has(groupKey)) groups.set(groupKey, newBuckets());
  const buckets = groups.get(groupKey);

  // Representation is the first IfcProductDefinitionShape reference in the argument list
  const shapeRef = entity.args.match(/#\d+/g)?.find((ref) => deref(ref)?.type === 'IFCPRODUCTDEFINITIONSHAPE');
  if (!shapeRef) continue;

  const representations = deref(shapeRef).args.match(/#\d+/g).map(deref);
  const faceSets = representations
    .flatMap((rep) => rep.args.match(/\((#\d+(,#\d+)*)\)\)?$/)?.[1].split(',') ?? [])
    .map(deref)
    .filter((e) => e?.type === 'IFCTRIANGULATEDFACESET');

  if (faceSets.length === 0) {
    const meshes = productMeshes(entityId);
    for (const { positions, indices, colour } of meshes) {
      if (Math.max(...positions.map((p) => p[2])) <= 0) {
        skipped++;
        continue; // fully underground
      }
      const material = colour ? colourMaterial(colour) : pickMaterial(entity.type, name);
      buckets[material] ??= { positions: [], indices: [] };
      const bucket = buckets[material];
      const base = bucket.positions.length / 3;
      for (const [x, y, z] of positions) {
        bucket.positions.push(x * UNIT_SCALE, z * UNIT_SCALE, -y * UNIT_SCALE); // Z-up -> Y-up
      }
      for (const idx of indices) bucket.indices.push(base + idx);
    }
    if (meshes.length > 0) elementCount++;
    continue;
  }

  for (const faceSet of faceSets) {
    const coordList = deref(faceSet.args.split(',')[0]);
    const coords = parseNumbers(coordList.args);
    if (Math.max(...coords.filter((_, i) => i % 3 === 2)) <= 0) {
      skipped++;
      continue; // fully underground
    }

    // CoordIndex is the 4th argument: ((1,2,3),(...)) with 1-based indices
    const indexBlock = /,\.[TF]\.,\((\(.*?\))\)/s.exec(faceSet.args)?.[1];
    if (!indexBlock) continue;
    const triIndices = parseNumbers(indexBlock);

    const bucket = buckets[pickMaterial(entity.type, name)];
    const base = bucket.positions.length / 3;
    for (let i = 0; i < coords.length; i += 3) {
      bucket.positions.push(coords[i], coords[i + 2], -coords[i + 1]); // Z-up -> Y-up
    }
    for (const idx of triIndices) bucket.indices.push(base + idx - 1);
  }
  elementCount++;
}

// --- 4. BUILD GLB ---
const writeGlb = (buckets, filePath, sceneName) => {
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];
  const chunks = [];
  let byteOffset = 0;

  const pushView = (typedArray, target) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const padding = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(padding));
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target });
    byteOffset += bytes.length + padding;
    return bufferViews.length - 1;
  };

  for (const [materialName, { positions, indices }] of Object.entries(buckets)) {
    if (indices.length === 0) continue;

    const pos = new Float32Array(positions);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], pos[i + j]);
        max[j] = Math.max(max[j], pos[i + j]);
      }
    }
    const idx = pos.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);

    accessors.push({ bufferView: pushView(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    const positionAccessor = accessors.length - 1;
    accessors.push({
      bufferView: pushView(idx, 34963),
      componentType: idx instanceof Uint32Array ? 5125 : 5123,
      count: idx.length,
      type: 'SCALAR',
    });
    const indexAccessor = accessors.length - 1;

    const [r, g, b, a] = MATERIALS[materialName];
    materials.push({
      name: materialName,
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [r, g, b, a], metallicFactor: 0, roughnessFactor: 0.9 },
      ...(a < 1 && { alphaMode: 'BLEND' }),
    });
    meshes.push({
      name: materialName,
      primitives: [{ attributes: { POSITION: positionAccessor }, indices: indexAccessor, material: materials.length - 1 }],
    });
    nodes.push({ name: materialName, mesh: meshes.length - 1 });
  }

  const binary = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'digital-twin-airport ifc-to-glb' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.length }],
  };

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);

  const chunkHeader = (length, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.concat([header, chunkHeader(json.length, 0x4e4f534a), json, chunkHeader(binary.length, 0x004e4942), binary])
  );
};

const triangleCount = (buckets) => Object.values(buckets).reduce((n, b) => n + b.indices.length / 3, 0);
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

if (!splitByStorey) {
  writeGlb(groups.get('model'), outputPath, path.basename(inputPath));
  console.log(`✅ ${elementCount} elements (${skipped} underground meshes skipped) -> ${outputPath}`);
  console.log(`   ${triangleCount(groups.get('model'))} tris, ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
} else {
  const schema = /FILE_SCHEMA\(\('([^']+)'/.exec(text)?.[1] ?? 'IFC';
  const manifest = { source: path.basename(inputPath), schema, storeys: [] };
  for (const [key, buckets] of groups) {
    const storey = storeys.get(key) ?? { name: 'Site', elevation: 0 };
    const file = `${slug(storey.name)}.glb`;
    writeGlb(buckets, path.join(outputPath, file), storey.name);
    manifest.storeys.push({
      id: slug(storey.name),
      name: storey.name,
      elevation: storey.elevation,
      file,
      triangles: triangleCount(buckets),
      bytes: fs.statSync(path.join(outputPath, file)).size,
    });
  }
  manifest.storeys.sort((a, b) => a.elevation - b.elevation);
  fs.writeFileSync(path.join(outputPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`✅ ${elementCount} elements (${skipped} underground meshes skipped) -> ${outputPath}`);
  for (const st of manifest.storeys)
    console.log(`   ${st.name.padEnd(12)} ${String(st.elevation).padStart(6)} m  ${String(st.triangles).padStart(6)} tris  ${(st.bytes / 1024).toFixed(0)} KB`);
}

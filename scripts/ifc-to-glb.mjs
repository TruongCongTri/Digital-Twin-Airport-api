/**
 * @file scripts/ifc-to-glb.mjs
 * @description Converts a tessellated IFC4 ReferenceView model (IfcTriangulatedFaceSet geometry)
 * into a lightweight GLB the web map can render with ArcGIS.
 *
 * - Meshes are merged into one primitive per material (timber, steel, glass, concrete, ...).
 * - Coordinates stay in the IFC site frame (metres, origin = model origin); IFC Z-up is
 *   converted to glTF Y-up as (x, y, z) -> (x, z, -y).
 * - Elements entirely below ground (footings, grade beams) are skipped.
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

// Element id -> storey id, from IfcRelContainedInSpatialStructure
const storeyOf = new Map();
const storeys = new Map(); // storey id -> { name, elevation }
for (const [id, e] of entities) {
  if (e.type === 'IFCBUILDINGSTOREY') {
    const name = /^'[^']*',[^,]*,'([^']*)'/.exec(e.args)?.[1] ?? `Storey ${id}`;
    const elevation = Number(e.args.split(',').pop());
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
};

const pickMaterial = (type, name) => {
  const n = name.toLowerCase();
  if (type === 'IFCCURTAINWALL' || n.includes('glass') || type === 'IFCDOOR') return 'glass';
  if (n.includes('pool') || n.includes('fountain')) return 'water';
  if (type === 'IFCROOF') return 'timberRoof';
  if (n.includes('timber') || n.includes('rafter') || n.includes('branching')) return 'timber';
  if (type === 'IFCBUILDINGELEMENTPROXY') return 'tower';
  if (n.startsWith('str ') || n.includes('mullion') || n.includes('transom') || n.includes('antenna') || type === 'IFCRAILING')
    return 'steel';
  return 'concrete';
};

const PRODUCT_TYPES = new Set([
  'IFCSLAB', 'IFCROOF', 'IFCBEAM', 'IFCMEMBER', 'IFCCURTAINWALL', 'IFCCOLUMN', 'IFCFOOTING',
  'IFCBUILDINGELEMENTPROXY', 'IFCDOOR', 'IFCRAILING', 'IFCWALL',
]);

// --- 3. COLLECT GEOMETRY PER (STOREY,) MATERIAL ---
const newBuckets = () => Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, { positions: [], indices: [] }]));
const groups = new Map(); // group key -> buckets
let elementCount = 0;
let skipped = 0;

for (const [entityId, entity] of entities) {
  if (!PRODUCT_TYPES.has(entity.type)) continue;
  const groupKey = splitByStorey ? (storeyOf.get(entityId) ?? 'site') : 'model';
  if (!groups.has(groupKey)) groups.set(groupKey, newBuckets());
  const buckets = groups.get(groupKey);

  const name = /^'[^']*',[^,]*,'([^']*)'/.exec(entity.args)?.[1] ?? '';
  // Representation is the first IfcProductDefinitionShape reference in the argument list
  const shapeRef = entity.args.match(/#\d+/g)?.find((ref) => deref(ref)?.type === 'IFCPRODUCTDEFINITIONSHAPE');
  if (!shapeRef) continue;

  const representations = deref(shapeRef).args.match(/#\d+/g).map(deref);
  const faceSets = representations
    .flatMap((rep) => rep.args.match(/\((#\d+(,#\d+)*)\)\)?$/)?.[1].split(',') ?? [])
    .map(deref)
    .filter((e) => e?.type === 'IFCTRIANGULATEDFACESET');

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
  const manifest = { source: path.basename(inputPath), storeys: [] };
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

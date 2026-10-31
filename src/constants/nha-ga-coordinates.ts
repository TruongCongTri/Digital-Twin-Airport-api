// src/constants/nha-ga-coordinates.ts
// NOTE: Keep identical to Digital-Twin-Airport-web/constants/nha-ga-coordinates.ts

/**
 * Nha Ga site (VVNG) — built from the Revit IFC2x3 export `nhà gaaa.ifc` (API repo: src/data).
 *
 * The model is a landside site plan, not a building: two roads (y -57..-49 and -124..-104),
 * a sand plaza with a round fountain, two 55 x 82 m paved pads, low kerb walls and trees.
 * It has no interior spaces and no runway, so the pads serve as aircraft stands and the
 * runway + taxiway below are procedural, as at VVGA.
 *
 * The IFC site location is Revit's default (Boston), so ORIGIN is a PLACEHOLDER placement
 * in northern Vietnam. Every coordinate below is derived from local
 * metres, so moving the site only requires changing those two values.
 *
 * IFC local frame: +X = long axis of the roads, +Y = airside (pads), -Y = landside (plaza).
 */
type LatLng = { lat: number; lng: number };

const ORIGIN: LatLng = { lat: 21.0, lng: 106.1 };
// Bearing (degrees clockwise from north) of the IFC +X axis: the file's TrueNorth is (0, 1),
// so +Y is north and +X is east
const HEADING_DEG = 90;

const METRES_PER_DEG_LAT = 111_320;
const toGeo = (x: number, y: number): LatLng => {
  const h = (HEADING_DEG * Math.PI) / 180;
  const east = x * Math.sin(h) - y * Math.cos(h);
  const north = x * Math.cos(h) + y * Math.sin(h);
  return {
    lat: ORIGIN.lat + north / METRES_PER_DEG_LAT,
    lng: ORIGIN.lng + east / (METRES_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
};
const path = (points: [number, number][]) => points.map(([x, y]) => toGeo(x, y));
// Clockwise ring (ArcGIS requires clockwise outer rings for filled polygons)
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  path([
    [x0, y0],
    [x0, y1],
    [x1, y1],
    [x1, y0],
  ]);

// Procedural airside (local metres): 3,000 m runway, parallel taxiway, one link per pad
const RWY_Y = 420;
const TWY_Y = 300;
const WEST_PAD_X = -132.5;
const EAST_PAD_X = 132.5;

// Landside loop along the 20 m road; vehicles stop at the middle point (the plaza)
const taxiPath = path([
  [-195, -114],
  [-130, -114],
  [-70, -114],
  [0, -114],
  [70, -114],
  [130, -114],
  [195, -114],
]);

export const NHA_GA_COORDS = {
  CODE: 'VVNG',
  NAME: 'Nha Ga Terminal',

  // 1. Core Infrastructure
  CENTER: toGeo(0, -75),

  // 3D site model converted from the IFC, one GLB per layer + manifest.json
  // (scripts/ifc-to-glb.mjs in the API repo: npm run ifc:glb:vvng)
  MODEL: {
    baseUrl: '/models/vvng',
    origin: ORIGIN,
    // ArcGIS heading 0 = model +X east; rotate so +X follows HEADING_DEG
    heading: HEADING_DEG - 90,
  },

  // 2. Site outline, stands and sensor mounts taken from the IFC geometry
  SITE: {
    area: rect(-195, -195, 211, 46),
    plaza: toGeo(0, -90),
    fountain: toGeo(-2, -150),
    road: toGeo(-120, -114),
    // Three stands down the middle of each paved pad
    stands: {
      WEST: path([
        [WEST_PAD_X, -25],
        [WEST_PAD_X, 0],
        [WEST_PAD_X, 25],
      ]),
      EAST: path([
        [EAST_PAD_X, -25],
        [EAST_PAD_X, 5],
        [EAST_PAD_X, 35],
      ]),
    },
  },

  // Pavement drawn by the app (nothing in the IFC or the basemap covers it)
  AIRSIDE: {
    areas: [
      rect(-1500, TWY_Y - 12, 1500, TWY_Y + 12),
      rect(WEST_PAD_X - 12, 33, WEST_PAD_X + 12, TWY_Y),
      rect(EAST_PAD_X - 12, 46, EAST_PAD_X + 12, TWY_Y),
      rect(-1400, TWY_Y, -1380, RWY_Y),
    ],
  },

  // 3. Runway
  RUNWAYS: {
    RWY_07_25: {
      start: toGeo(-1500, RWY_Y),
      end: toGeo(1500, RWY_Y),
      area: rect(-1500, RWY_Y - 22.5, 1500, RWY_Y + 22.5),
    },
  },

  // 4. Ground Taxiways & Flight Paths (landing / take-off towards 090°)
  ROUTES: {
    WEST: {
      taxiPath,
      flightInbound: path([
        [-1300, RWY_Y],
        [-300, RWY_Y],
        [-180, TWY_Y],
        [WEST_PAD_X, TWY_Y],
        [WEST_PAD_X, 33],
        [WEST_PAD_X, 0],
      ]),
      flightOutbound: path([
        [WEST_PAD_X, 0],
        [WEST_PAD_X, TWY_Y],
        [-1390, TWY_Y],
        [-1390, RWY_Y],
        [1500, RWY_Y],
      ]),
    },
    EAST: {
      taxiPath,
      flightInbound: path([
        [-1300, RWY_Y],
        [100, RWY_Y],
        [EAST_PAD_X, TWY_Y],
        [EAST_PAD_X, 46],
        [EAST_PAD_X, 5],
      ]),
      flightOutbound: path([
        [EAST_PAD_X, 5],
        [EAST_PAD_X, TWY_Y],
        [-1390, TWY_Y],
        [-1390, RWY_Y],
        [1500, RWY_Y],
      ]),
    },
  },
};

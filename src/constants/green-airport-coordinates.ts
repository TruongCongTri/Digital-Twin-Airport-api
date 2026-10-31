// src/constants/green-airport-coordinates.ts
// NOTE: Keep identical to Digital-Twin-Airport-web/constants/green-airport-coordinates.ts

/**
 * Vietnam Green Airport (VVGA) — built from the IFC concept model
 * `Vietnam_Green_Airport_Coordination_Revit2024.ifc` (API repo: src/data).
 *
 * The IFC has no georeferencing (no IfcMapConversion / site lat-lng), so its local
 * site frame (metres) is placed at the Gia Bình airport site, Bắc Ninh, using ORIGIN
 * and HEADING_DEG. Every coordinate below is derived from local metres, so moving
 * the airport only requires changing those two values.
 *
 * IFC local frame: +X = terminal long axis (parallel to the runways),
 * +Y = airside (rear glazing), -Y = landside (entrance canopy), Z = up.
 */
type LatLng = { lat: number; lng: number };

const ORIGIN: LatLng = { lat: 21.049198921684162, lng: 106.19836335382935 };
// Bearing (degrees clockwise from north) of the IFC +X axis: 71.09° is the mean of the long
// edges (6.2 km) of the Gia Bình construction boundary in OpenStreetMap (ways 1524509518,
// 1545869239), so the terminal and runways run with the real site
const HEADING_DEG = 71;

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

// Runways (local metres): northern 07R/25L 3,500 m, southern 06L/24R 4,000 m, 45 m wide
const RWY_N_Y = 700;
const RWY_S_Y = -1100;

export const GREEN_AIRPORT_COORDS = {
  CODE: 'VVGA',
  NAME: 'Vietnam Green Airport',

  // 1. Core Infrastructure
  CENTER: toGeo(0, 0),
  ATC_TOWER: toGeo(110, 19),

  // 3D terminal model converted from the IFC, one GLB per storey + manifest.json
  // (scripts/ifc-to-glb.mjs in the API repo: npm run ifc:glb)
  MODEL: {
    baseUrl: '/models/vvga',
    origin: ORIGIN,
    // ArcGIS heading 0 = model +X east; rotate so +X follows HEADING_DEG
    heading: HEADING_DEG - 90,
  },

  // 2. Terminal Polygon, Parking Line & Storeys (from IfcBuildingStorey elevations)
  TERMINALS: {
    MAIN: {
      center: toGeo(0, 0),
      area: rect(-105, -46.5, 105, 46.5), // Ground podium slab
      parking: { start: toGeo(-75, 95), end: toGeo(75, 95) },
      wings: {
        WEST: { point: toGeo(-60, 0), z: 4.3 }, // Level 01 - check-in hall
        CENTER: { point: toGeo(0, 0), z: 11.0 }, // Level 02 - departures
        EAST: { point: toGeo(60, 0), z: 17.3 }, // Level 03 - concourse
      },
      roof: { point: toGeo(0, 0), z: 34 }, // Timber roof trusses
      tower: { point: toGeo(110, 19), z: 40 }, // Control tower cab
    },
  },

  // Apron in front of the airside glazing (stands + taxi lane)
  APRON: {
    area: rect(-140, 46.5, 140, 230),
  },

  // 3. Runway Extremes & Areas
  RUNWAYS: {
    RWY_07R_25L: {
      start: toGeo(-1750, RWY_N_Y),
      end: toGeo(1750, RWY_N_Y),
      area: rect(-1750, RWY_N_Y - 22.5, 1750, RWY_N_Y + 22.5),
    },
    RWY_06L_24R: {
      start: toGeo(-2000, RWY_S_Y),
      end: toGeo(2000, RWY_S_Y),
      area: rect(-2000, RWY_S_Y - 22.5, 2000, RWY_S_Y + 22.5),
    },
  },

  // 4. Ground Taxiways & Flight Paths (northern runway, landing/take-off towards 071°)
  ROUTES: {
    MAIN: {
      // Landside curb loop; vehicles stop at the middle point (entrance doors)
      taxiPath: path([
        [-600, -500],
        [-300, -200],
        [-150, -62],
        [0, -62],
        [150, -62],
        [300, -200],
        [600, -500],
      ]),
      flightInbound: path([
        [-1500, RWY_N_Y],
        [300, RWY_N_Y],
        [450, 400],
        [100, 400],
        [0, 200],
        [0, 120],
      ]),
      flightOutbound: path([
        [0, 120],
        [0, 200],
        [-200, 400],
        [-1650, 400],
        [-1750, RWY_N_Y],
        [1750, RWY_N_Y],
      ]),
    },
  },
};

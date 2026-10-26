/**
 * @file airport-routing.ts
 * @description Per-airport route groups (shared by the simulation engine and the flight API)
 * and the "airspace anchor" used for flights that are not physically at the airport.
 */
import { FlightStatus } from '@/generated/index';
import { LONG_THANH_COORDS, TAN_SON_NHAT_COORDS } from './airport-coordinates';
import { GREEN_AIRPORT_COORDS } from './green-airport-coordinates';

type LatLng = { lat: number; lng: number };
type RouteGroup = { taxiPath: LatLng[]; flightInbound: LatLng[]; flightOutbound: LatLng[] };

// Which route group a stand / vehicle uses
export const AIRPORT_ROUTING: Record<
  string,
  {
    routes: Record<string, RouteGroup>;
    vehicleTerminalKey: string;
    terminalKeyForStand: (standCode: string) => string;
  }
> = {
  VVTS: {
    routes: TAN_SON_NHAT_COORDS.ROUTES,
    vehicleTerminalKey: 'DOMESTIC',
    terminalKeyForStand: (code) => (code.includes('INTL') ? 'INTERNATIONAL' : 'DOMESTIC'),
  },
  VVLT: {
    routes: LONG_THANH_COORDS.ROUTES,
    vehicleTerminalKey: 'T1',
    terminalKeyForStand: (code) => (code.includes('T2') ? 'T2' : code.includes('T3') ? 'T3' : 'T1'),
  },
  [GREEN_AIRPORT_COORDS.CODE]: {
    routes: GREEN_AIRPORT_COORDS.ROUTES,
    vehicleTerminalKey: 'MAIN',
    terminalKeyForStand: () => 'MAIN',
  },
};

// Unknown airports fall back to Long Thanh routing (previous default behaviour)
export const getAirportRouting = (airportCode: string) =>
  AIRPORT_ROUTING[airportCode] ?? AIRPORT_ROUTING.VVLT!;

/** Statuses where the aircraft is in the air or elsewhere, not on this airport's surface. */
export const OFF_AIRPORT_STATUSES: FlightStatus[] = [
  'SCHEDULED',
  'DELAYED',
  'APPROACHING',
  'DEPARTED',
  'DIVERTED',
  'CANCELLED',
];

export const isOffAirport = (status: FlightStatus | string) =>
  OFF_AIRPORT_STATUSES.includes(status as FlightStatus);

/**
 * Where an off-airport flight is pinned on the map: departures at the end of the take-off
 * run, everything else (inbound / not yet arrived) at the landing threshold. Keeps the
 * camera and badge inside the airport instead of following the aircraft across the globe.
 */
export const getAirspaceAnchor = (airportCode: string, status: FlightStatus | string): LatLng => {
  const routes = getAirportRouting(airportCode).routes;
  const group = Object.values(routes).find(
    (r) => r.flightInbound.length && r.flightOutbound.length
  );
  if (!group) return { lat: 0, lng: 0 };
  return status === 'DEPARTED'
    ? group.flightOutbound[group.flightOutbound.length - 1]!
    : group.flightInbound[0]!;
};

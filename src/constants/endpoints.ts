/**
 * @file endpoints.ts
 * @description Registry of all API routes.
 * Prevents hardcoding URLs in controllers, services, or test suites.
 */

export const API_VERSION = '/api/v1';

export const ENDPOINTS = {
  /* --- Authentication Module --- */
  AUTH: {
    BASE: '/auth',
    REGISTER: '/register',
    LOGIN: '/login',
    LOGOUT: '/logout',
    REFRESH_TOKEN: '/refresh-token',
    GOOGLE: '/google',
    GOOGLE_CALLBACK: '/google/callback',
    SEND_VERIFY_EMAIL: '/send-verify-email',
    VERIFY_EMAIL: '/verify-email',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
    CHANGE_PASSWORD: '/change-password',
    SESSIONS: '/sessions',
    REVOKE_SESSION: '/sessions/:sessionId',
    REVOKE_OTHER_SESSIONS: '/sessions/others',
  },

  /* --- Infrastructure & BIM --- */
  INFRASTRUCTURE: {
    BASE: '/infrastructure',
    LAYERS: '/layers', // Fetch ArcGIS Building Scene Layer URLs
    ZONES: '/zones', // Fetch all airport zones (Check-in, Gates, Runways)
    ZONE_DETAIL: '/zones/:id',
    PARKING_STANDS: '/parking-stands', // Monitor aircraft parking availability
  },

  /* --- IoT Sensors --- */
  SENSOR: {
    BASE: '/sensors',
    GET_ALL: '/', // Handles queries like ?type=CO2&zoneId=123
    TYPES: '/metadata/types', // Returns available sensor types for UI dropdowns
    DETAIL: '/:id',
    HISTORY: '/:id/history', // Fetch historical time-series data for line charts
    GLOBAL_HISTORY: '/logs/all',
    STATIC: '/static',
  },

  /* --- Crowd Management (AI Camera Mock) --- */
  CROWD: {
    BASE: '/crowd',
    DENSITY: '/density', // Current density across all zones
    ZONE_PREDICTION: '/zones/:zoneId/prediction', // AI flow prediction
  },

  /* --- Aviation & Flight Tracking --- */
  FLIGHT: {
    BASE: '/flights',
    GET_ALL: '/',
    ACTIVE: '/active', // List of currently tracked flights on tarmac/air
    DETAIL: '/:id',
    TELEMETRY: '/:id/telemetry', // Specific flight coordinate history
    ALLOCATION: '/:id/allocation', // Get/Update assigned parking stand or gate
    STATUS: '/:id/status', // Update flight status (e.g., ARRIVED, DEPARTED)
    STATIC: '/static',
  },

  /* --- Zone Management --- */
  ZONE: {
    BASE: '/zones',
    GET_ALL: '/',
    DETAIL: '/:id',
    ANALYTICS: '/:id/analytics', // AI-generated crowd density & bottleneck predictions\
    STATIC: '/static',
  },

  //
  GH: {
    BASE: '/ground-vehicles',
    GET_ALL: '/',
    ACTIVE: '/active',
    DETAIL: '/:id',
    TELEMETRY: '/:id/telemetry',
    ALLOCATION: '/:id/allocation',
    STATUS: '/:id/status',
    STATIC: '/static',
  },

  /* --- Simulation & Demo Engine --- */
  SIMULATION: {
    BASE: '/simulation',
    START: '/start', // Start general mock data generation
    STOP: '/stop',
    REBOOT: '/reboot',
    SCENARIO: '/scenario', // Trigger specific Demo Killer Features (e.g., TIRE_OVERHEAT)
    STATUS: '/status',
  },
} as const;

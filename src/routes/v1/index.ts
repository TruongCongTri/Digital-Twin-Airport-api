/**
 * @file index.ts
 * @description Version 1 (V1) Router entry point.
 * Aggregates all module-specific routes under the /api/v1 namespace.
 * @module Routes/V1
 */
import { Router } from 'express';
import { ENDPOINTS } from '../../constants/endpoints';
import sensorRoute from '../../modules/sensor/sensor.route';
import simulationRoute from '../../modules/simulation/simulation.route';
import flightRoute from '@/modules/flight/flight.route';
import zoneRoute from '@/modules/zone/zone.route';
import groundVehicleRoute from '@/modules/ground-vehicle/ground-vehicle.route';
const v1Router = Router();

/**
 * Mount Module Routes
 * Individual domain routes are attached to their respective base paths
 * defined in the global ENDPOINTS constant.
 */
v1Router.use(ENDPOINTS.SENSOR.BASE, sensorRoute);
v1Router.use(ENDPOINTS.SIMULATION.BASE, simulationRoute);
v1Router.use(ENDPOINTS.FLIGHT.BASE, flightRoute);
v1Router.use(ENDPOINTS.ZONE.BASE, zoneRoute);
v1Router.use(ENDPOINTS.GH.BASE, groundVehicleRoute);

export default v1Router;

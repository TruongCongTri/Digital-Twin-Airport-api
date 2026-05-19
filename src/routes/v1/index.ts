/**
 * @file index.ts
 * @description Version 1 (V1) Router entry point.
 * Aggregates all module-specific routes under the /api/v1 namespace.
 * @module Routes/V1
 */
import { Router } from 'express';
// import { ENDPOINTS } from '../../constants/endpoints';

const v1Router = Router();

/**
 * Mount Module Routes
 * Individual domain routes are attached to their respective base paths
 * defined in the global ENDPOINTS constant.
 */
// v1Router.use(ENDPOINTS, controllerRouter);

export default v1Router;

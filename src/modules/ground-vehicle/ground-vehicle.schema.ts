import { z } from 'zod';
import { paginationSchema } from '@/common/schemas/reusable.schema';

export const VEHICLE_TYPES = [
  'BAGGAGE_TUG',
  'FUEL_TRUCK',
  'PASSENGER_BUS',
  'CATERING_TRUCK',
  'FOLLOW_ME_CAR',
] as const;

export const VEHICLE_STATUSES = [
  'IDLE',
  'DISPATCHED',
  'CHARGING',
  'MAINTENANCE',
  'OFFLINE',
] as const;

export const createVehicleSchema = z.object({
  body: z.object({
    callsign: z.string().min(1, { message: 'Callsign is required' }),
    type: z.enum(VEHICLE_TYPES),
    status: z.enum(VEHICLE_STATUSES).optional(),
    airportId: z.string().uuid({ message: 'Invalid Airport ID format' }),
  }),
});

export const updateVehicleStatusSchema = z.object({
  body: z.object({
    status: z.enum(VEHICLE_STATUSES),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const addVehicleTelemetrySchema = z.object({
  body: z.object({
    longitude: z.number(),
    latitude: z.number(),
    speed: z.number(),
    batteryLevel: z.number().min(0).max(100).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const getVehiclesQuerySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(VEHICLE_TYPES).optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
    airportId: z.string().optional(), // Accepts ICAO or UUID
  }),
});

export type CreateVehicleDTO = z.infer<typeof createVehicleSchema>['body'];
export type UpdateVehicleStatusDTO = z.infer<typeof updateVehicleStatusSchema>['body'];
export type AddVehicleTelemetryDTO = z.infer<typeof addVehicleTelemetrySchema>['body'];
export type GetVehiclesQuery = z.infer<typeof getVehiclesQuerySchema>['query'];

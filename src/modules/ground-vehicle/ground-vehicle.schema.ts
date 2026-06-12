import { z } from 'zod';
import { paginationSchema } from '@/common/schemas/reusable.schema';

export const VEHICLE_TYPES = ['PERSONAL_CAR', 'TAXI', 'RIDE_HAIL', 'VIP_TRANSFER'] as const;

export const VEHICLE_STATUSES = [
  'APPROACHING_DROP_OFF',
  'DROPPING_OFF',
  'PARKED',
  'APPROACHING_PICK_UP',
  'PICKING_UP',
  'EXITING',
] as const;

export const createVehicleSchema = z.object({
  body: z.object({
    licensePlate: z.string().min(1, { message: 'License plate is required' }),
    type: z.enum(VEHICLE_TYPES),
    status: z.enum(VEHICLE_STATUSES).optional(),
    brand: z.string().optional(),
    carModel: z.string().optional(),
    companyName: z.string().optional(),
    imageUrl: z.string().url().optional(),
    logoUrl: z.string().url().optional(),
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
    heading: z.number(), // ✅ Required for 3D map rotation
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

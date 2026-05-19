/**
 * @file resources.ts
 * @description Defines all manageable entities (resources) in the system.
 */

export const RESOURCES = {
  /* --- System --- */
  USER: 'User',
  SESSION: 'Login Session',

  /* --- General --- */
  ROLE: 'Role',
  PERMISSION: 'Permission',
  OTP: 'OTP Code',
  EMAIL: 'Email',
  SMS: 'SMS',
  ZALO: 'Zalo',

  /* --- Sensor Module --- */
  SENSOR: 'Sensor',
} as const;

export type ResourceName = (typeof RESOURCES)[keyof typeof RESOURCES];

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

  /* --- Score Event Module --- */
  SCORE_EVENT: 'Score Event',
  LIVE_SCOREBOARD: 'Live Scoreboard',
  PLAYER_SCORE: 'Player Score',
} as const;

export type ResourceName = (typeof RESOURCES)[keyof typeof RESOURCES];

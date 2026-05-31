/**
 * @file fields.ts
 * @description Registry of all field names used in the system.
 * Used primarily for consistent UI labels in validation messages.
 */
export const FIELDS = {
  // --- SERVER ---
  DB: 'DATABASE_URL',
  CLIENT: 'CLIENT_URL',

  /* --- 1. GENERAL & INFRASTRUCTURE --- */
  ID: 'ID',
  SLUG: 'Slug',
  STATUS: 'Status',
  DIRECTION: 'Direction',
  CREATED_AT: 'Created at',
  UPDATED_AT: 'Updated at',
  DELETED_AT: 'Deleted at',

  /* --- 2. AUTHENTICATION & USER --- */
  EMAIL: 'Email',
  PHONE: 'Phone number',
  PASSWORD: 'Password',
  CURRENT_PASSWORD: 'Current password',
  NEW_PASSWORD: 'New password',
  CONFIRM_PASSWORD: 'Confirm password',
  FULL_NAME: 'Full name',
  AVATAR: 'Avatar',
  DEVICE_ID: 'Device ID',
  SESSION_ID: 'Session ID',
  IDENTIFIER: 'Identifier (Email/Phone)',
  OTP_CODE: 'Verification code (OTP)',
  CHANNEL: 'Delivery channel',
  TOKEN: 'Token',
  REFRESH_TOKEN: 'Refresh Token',

  /* --- 4. SENSOR MODULE --- */
  TITLE: 'Title',
  DESCRIPTION: 'Description',
  TYPE: 'Type',
  X: 'X coordinate',
  Y: 'Y coordinate',
  Z: 'Z coordinate',
  ZONE: 'Zone ID',
  PRICE: 'Price',
  THUMBNAIL: 'Thumbnail',
  CATEGORY: 'Category',
  SELLER: 'Seller',
  INSTRUCTOR: 'Instructor',
  MIN_PRICE: 'Minimum price',
  MAX_PRICE: 'Maximum price',

  SCENARIO: 'Scenario',

  /* --- 5. FLIGHT MODULE --- */
  FLIGHT_NUMBER: 'Flight Number',
  AIRLINE: 'Airline',
  ORIGIN: 'Origin',
  DESTINATION: 'Destination',
  PARKING_STAND: 'Parking Stand',
  LONGITUDE: 'Longitude',
  LATITUDE: 'Latitude',
  ALTITUDE: 'Altitude',
  HEADING: 'Heading',
  SPEED: 'Speed',

  ZONE_NAME: 'Zone Name',
  ZONE_TYPE: 'Zone Type',
  FLOOR_LEVEL: 'Floor Level',
  MAX_CAPACITY: 'Max Capacity',
} as const;

export type FieldName = (typeof FIELDS)[keyof typeof FIELDS];

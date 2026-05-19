/**
 * @file messages.ts
 * @description Centralized message factory for the application.
 * Provides consistent phrasing for success, error, and validation states.
 */
import { ResourceName } from './resources';
import { FieldName } from './fields';

export const MESSAGES = {
  SERVER: {
    CONFIGURE: (field: FieldName) => `Please configure ${field}.`,
  },
  // 1. COMMON CRUD MESSAGES
  COMMON: {
    SUCCESS: {
      CREATED: (resource: ResourceName) => `${resource} created successfully.`,
      UPDATED: (resource: ResourceName) => `${resource} updated successfully.`,
      DELETED: (resource: ResourceName) => `${resource} deleted successfully.`,
      FETCHED: (resource: ResourceName) => `${resource} fetched successfully.`,
    },
    ERROR: {
      NOT_FOUND: (resource: ResourceName) => `${resource} not found in the system.`,
      ALREADY_EXISTS: (resource: ResourceName) => `This ${resource.toLowerCase()} already exists.`,
      INVALID_INPUT: 'Invalid input data.',
      INTERNAL_SERVER_ERROR: 'Internal server error. Please try again later.',
    },
  },
  SYSTEM: {
    UNIQUE_CONSTRAINT: (field: string) =>
      `Data already exists. Unique constraint violated on: ${field}`,
    RECORD_NOT_FOUND: 'Requested data not found in the system.',
  },
  // 2. SECURITY & MIDDLEWARE
  MIDDLEWARE: {
    FORBIDDEN: 'You do not have permission to access this resource.',
    FORBIDDEN_OWNERSHIP: "You do not have permission to modify another user's data.",
    MISSING_PERMISSION: (action: string) => `Access denied. Missing permission: [${action}].`,
  },
  RATE_LIMIT: {
    API_SPAM: (minutes: number) => `Too many requests. Please try again in ${minutes} minutes.`,
    AUTH_SPAM: (minutes: number) => `Too many attempts. Please try again in ${minutes} minutes.`,
  },
  NOTIFICATION: {
    MISSING_ESMS_KEYS: 'eSMS Keys are not configured.',
    MISSING_ZALO_TOKEN: 'Zalo Access Token is not configured.',
    SMS_REJECTED: 'SMS Gateway rejected the request.',
    EMAIL_FAILED: 'Unable to send Email OTP at this time.',
    SMS_FAILED: 'Unable to send SMS OTP at this time.',
    ZALO_FAILED: 'Unable to send Zalo message at this time.',
  },

  // 3. ZOD VALIDATION MESSAGES
  VALIDATION: {
    REQUIRED: (field: FieldName) => `${field} is required.`,
    MUST_BE_STRING: (field: FieldName) => `${field} must be a string.`,
    INVALID_EMAIL: 'Invalid email format.',
    MIN_LENGTH: (field: FieldName, min: number) => `${field} must be at least ${min} characters.`,
    MAX_LENGTH: (field: FieldName, max: number) => `${field} must not exceed ${max} characters.`,
    EXACT_LENGTH: (field: FieldName, length: number) =>
      `${field} must be exactly ${length} characters.`,
    INVALID_FORMAT: (field: FieldName) => `Invalid format for ${field}.`,
    INVALID_CHARS: (field: FieldName) => `${field} contains invalid characters.`,
    ONLY_NUMBERS: (field: FieldName) => `${field} must contain only numbers.`,
    INVALID_UUID: (field: FieldName) => `${field} is not a valid UUID.`,
    INVALID_ENUM: (field: FieldName) => `Invalid ${field}.`,
    MIN_VALUE_INVALID: (field: FieldName) =>
      `Minimum ${field} cannot be greater than maximum ${field}.`,

    // Auth Specific
    PASSWORD_UPPERCASE: 'Password must contain at least 1 uppercase letter.',
    PASSWORD_NUMBER: 'Password must contain at least 1 number.',
    PASSWORD_NOT_MATCH_OLD: 'New password cannot be the same as the current password.',
    PASSWORD_TOO_SIMILAR: 'New password cannot contain parts of the current password.',
    MISSING_COOKIE_TOKEN: 'Refresh Token not found in cookies.',
  },

  // 4. AUTH & BUSINESS LOGIC
  AUTH: {
    SUCCESS: {
      REGISTER: 'Registration successful. Please check your email to verify.',
      LOGIN: 'Logged in successfully.',
      REFRESH_TOKEN: 'Token refreshed successfully.',
      GET_SESSIONS: 'Device sessions fetched successfully.',
      REVOKE_SESSION: 'Logged out from device successfully.',
      REVOKE_OTHER_SESSIONS: 'Logged out from all other devices successfully.',
      LOGOUT: 'Logged out successfully.',
      OTP_SENT: 'Verification code has been sent.',
      OTP_VERIFIED: 'Email verified successfully.',
      FORGOT_PASSWORD_SENT: 'Password recovery code has been sent.',
      RESET_PASSWORD: 'Password reset successfully. Please log in again.',
      CHANGE_PASSWORD: 'Password changed successfully.',
    },
    ERROR: {
      UNAUTHENTICATED: 'Unauthenticated. Please log in.',
      MISSING_TOKEN: 'Token not found.',
      INVALID_TOKEN: 'Invalid token format.',
      TOKEN_EXPIRED: 'Token has expired.',
      MISSING_COOKIE_TOKEN: 'Session expired.',
      INVALID_SESSION: 'Invalid login session.',
      SESSION_REVOKED: 'Login session has been revoked.',
      SESSION_EXPIRED: 'Login session has expired.',
      INVALID_CREDENTIALS: 'Account does not exist or has been locked.',
      WRONG_PASSWORD: (attemptsLeft: number) =>
        `Incorrect password. You have ${attemptsLeft} attempts left.`,
      ACCOUNT_LOCKED: (minutes: number) =>
        `Account is locked. Please try again in ${minutes} minutes.`,
      EMAIL_ALREADY_VERIFIED: 'Email is already verified.',
      PHONE_ALREADY_VERIFIED: 'Phone number is already verified.',
      OTP_COOLDOWN: (seconds: number) => `Please try again in ${seconds} seconds.`,
      INVALID_OTP: 'OTP code is invalid or does not exist.',
      EXPIRED_OTP: 'OTP code has expired.',
      WRONG_CURRENT_PASSWORD: 'Current password is incorrect.',
      PASSWORD_MUST_BE_DIFFERENT: 'New password must be different from the current password.',
      ROLE_NOT_FOUND: 'Configuration error: Default Role not found.',
    },
  },

  // 5. EXAMPLES
};

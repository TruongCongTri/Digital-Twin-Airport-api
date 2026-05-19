/**
 * @file app.constants.ts
 * @description Global application constants.
 * Acts as the Single Source of Truth for default configurations and environment keys.
 */
export const APP_CONFIG = {
  /* --- 1. Server Defaults --- */
  SERVER: {
    DEFAULT_PORT: '5000',
    PAGINATION: {
      DEFAULT_LIMIT: 10,
      MAX_LIMIT: 100,
    },
  },

  /* --- 2. COMMON DATA DEFAULTS --- */
  COMMON: {
    PAGINATION: {
      DEFAULT_PAGE: 1,
      DEFAULT_SKIP: 0,
      DEFAULT_LIMIT: 10,
      MAX_LIMIT: 100, // Prevents DoS by requesting massive datasets
    },
    UPLOAD: {
      MAX_IMAGE_SIZE_MB: 5,
      MAX_VIDEO_SIZE_MB: 500,
    },
  },

  /* --- 3. SECURITY & AUTHENTICATION --- */
  SECURITY: {
    BCRYPT_SALT_ROUNDS: 10,
    JWT: {
      ACCESS_EXPIRES_IN: '15m',
      REFRESH_EXPIRES_IN: '7d',
    },
  },
  AUTH: {
    DEFAULT_ROLE: 'USER',
    MAX_DEVICES_PER_USER: 3,
    MAX_FAILED_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
    OTP_VERIFY_EXPIRATION_MINUTES: 5,
    OTP_FORGOT_EXPIRATION_MINUTES: 15,
    OTP_COOLDOWN_SECONDS: 60,
    SESSION_EXPIRES_IN_DAYS: 1,
    REMEMBER_ME_EXPIRES_IN_DAYS: 30,
  },

  /* --- 4. MODULE SPECIFIC RULES --- */
  SCORE_EVENT: {
    MAX_POINT: 10000,
  },

  /* --- Node Environments --- */
  ENV: {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test',
  },

  /* --- 5. INFRASTRUCTURE --- */
  PRISMA: {
    LOG_LEVELS: {
      DEV: ['query', 'info', 'warn', 'error'],
      PROD: ['error'],
    },
  },

  /* --- 6. API LIMITS --- */
  RATE_LIMIT: {
    API_WINDOW_MINUTES: 15,
    API_MAX_REQUESTS: 100,
    AUTH_WINDOW_MINUTES: 1,
    AUTH_MAX_REQUESTS: 5,
  },
  // Future modules:
  // COURSE: { MAX_VIDEO_SIZE_MB: 500 }
};

/**
 * @constant OTP_CHANNELS
 * @description Standardized text sending channels
 */
export const OTP_CHANNELS = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  ZALO: 'ZALO',
} as const;

/**
 * @constant SORT_OPTIONS
 * @description Standardized sorting keys for various resource listings.
 */
export const SORT_OPTIONS = {
  PRODUCT: ['newest', 'popular', 'rating', 'trending'] as const,
  SELLER: ['popular', 'rating'] as const,
  CATEGORY: ['popular', 'productCount'] as const,
};

export const TIMEFRAME_OPTIONS = ['24h', '7d', '30d'] as const;

/* --- EXPORTED TYPES --- */
export type OtpChannel = keyof typeof OTP_CHANNELS;
export type SortOption = keyof typeof SORT_OPTIONS;
export type TimeframeOption = keyof typeof TIMEFRAME_OPTIONS;

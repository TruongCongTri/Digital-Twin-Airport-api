import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../configs/env';

export interface JwtPayload {
  id: string;
  role: string;
  [key: string]: any;
}

export const JwtUtil = {
  // --- 1. ACCESS TOKEN ---
  generateAccessToken: (payload: JwtPayload, options: SignOptions = {}): string => {
    const signOptions: SignOptions = { ...options };
    if (signOptions.expiresIn === undefined) {
      signOptions.expiresIn = env.JWT_EXPIRES_IN as any;
    }
    return jwt.sign(payload, env.JWT_SECRET, signOptions);
  },

  verifyAccessToken: (token: string): JwtPayload => {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  },

  // --- 2. REFRESH TOKEN ---
  generateRefreshToken: (payload: { id: string }, options: SignOptions = {}): string => {
    const signOptions: SignOptions = { ...options };
    if (signOptions.expiresIn === undefined) {
      signOptions.expiresIn = env.JWT_REFRESH_EXPIRES_IN as any;
    }
    // Chú ý: Dùng JWT_REFRESH_SECRET
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, signOptions);
  },

  verifyRefreshToken: (token: string): { id: string } => {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string };
  },
};

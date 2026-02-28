/**
 * Verification code data structure stored in the data store
 */
export interface VerificationCode {
  code: string;
  status: "unused" | "used" | "expired";
  usedAt: number | null;
  deviceId: string | null;
  expiresAt: number;
}

/**
 * API response types
 */
export interface VerifyResponse {
  success: boolean;
  token?: string;
  message: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  message?: string;
}

export interface StatsResponse {
  total: number;
  used: number;
  unused: number;
  expired: number;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  code: string;
  deviceId: string;
  iat: number;
  exp: number;
}

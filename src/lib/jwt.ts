import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "./types";

/**
 * Get JWT secret from environment
 */
function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  
  // Use a default secret for local development
  if (!secret) {
    console.warn("JWT_SECRET not set, using default dev secret (do not use in production)");
    return new TextEncoder().encode("dev-secret-key-for-local-testing-only");
  }
  
  return new TextEncoder().encode(secret);
}

/**
 * Generate a JWT token for verified users
 * @param code - The verification code
 * @param deviceId - The device fingerprint
 * @returns JWT token string (30 day expiration)
 */
export async function generateToken(code: string, deviceId: string): Promise<string> {
  const secret = getJWTSecret();
  
  const token = await new SignJWT({ code, deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  
  return token;
}

/**
 * Verify a JWT token
 * @param token - The JWT token to verify
 * @returns The decoded payload or null if invalid
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);
    
    return payload as unknown as JWTPayload;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return null;
  }
}

/**
 * Check if a token is expired
 * @param payload - The JWT payload
 * @returns True if expired
 */
export function isTokenExpired(payload: JWTPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Get token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The token string or null
 */
export function getTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }
  
  return parts[1];
}

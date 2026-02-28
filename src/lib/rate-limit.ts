/**
 * Simple in-memory rate limiter for Cloudflare Workers/Pages
 * Note: In production with multiple instances, you'd want to use Cloudflare's rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

/**
 * Clean up expired rate limit entries
 */
function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (entry.resetTime < now) {
      rateLimits.delete(key);
    }
  }
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (usually IP address)
 * @param maxRequests - Maximum requests allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns True if rate limited
 */
export function isRateLimited(
  identifier: string,
  maxRequests: number = 5,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const entry = rateLimits.get(identifier);
  
  if (!entry || entry.resetTime < now) {
    // First request or window expired
    rateLimits.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return false;
  }
  
  if (entry.count >= maxRequests) {
    // Rate limit exceeded
    return true;
  }
  
  // Increment count
  entry.count++;
  return false;
}

/**
 * Get rate limit info for response headers
 * @param identifier - Unique identifier
 * @returns Object with limit, remaining, and reset info
 */
export function getRateLimitInfo(
  identifier: string,
  maxRequests: number = 5
): { limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const entry = rateLimits.get(identifier);
  
  if (!entry || entry.resetTime < now) {
    return {
      limit: maxRequests,
      remaining: maxRequests,
      reset: Math.floor((now + 60000) / 1000),
    };
  }
  
  return {
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    reset: Math.floor(entry.resetTime / 1000),
  };
}

/**
 * Get client IP from request
 * @param request - Cloudflare request object
 * @returns IP address string
 */
export function getClientIP(request: Request): string {
  // Cloudflare provides client IP in headers
  const cfConnectingIP = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  return "unknown";
}

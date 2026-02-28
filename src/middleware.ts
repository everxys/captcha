import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Paths that don't require authentication
 */
const PUBLIC_PATH_PREFIXES = [
  "/api/verify",
  "/api/validate-token",
  "/api/stats",
  "/api/captchas",
  "/api/codes",
  "/api/code",
  "/api/cron",
  "/captchas",
  "/_next",
  "/favicon.ico",
];

/**
 * Check if a path is public
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Get token from request
 */
function getToken(request: NextRequest): string | null {
  // Try Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      return parts[1];
    }
  }
  
  // Try cookie
  const tokenCookie = request.cookies.get("authToken");
  if (tokenCookie) {
    return tokenCookie.value;
  }
  
  return null;
}

/**
 * Next.js middleware for route protection
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }
  
  // Check for auth token
  const token = getToken(request);
  
  if (!token) {
    // No token, redirect to admin login page
    const loginUrl = new URL("/captchas", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Configure which routes the middleware runs on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

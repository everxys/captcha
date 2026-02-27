import { NextRequest, NextResponse } from "next/server";
import { getAllVerificationCodes, generateCaptchas } from "@/lib/kv";

export const runtime = "nodejs";

/**
 * GET /api/captchas
 * Get all verification codes with pagination using flow queries
 * 
 * Query parameters:
 *   - limit: Number of items per page (default: 100, max: 1000)
 *   - cursor: Pagination cursor from previous response
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Admin authentication check
    const adminSecret = request.headers.get("X-Admin-Secret");
    const expectedSecret = process.env.ADMIN_SECRET;
    
    if (expectedSecret && adminSecret !== expectedSecret) {
      return NextResponse.json(
        { message: "未授权" },
        { status: 401 }
      );
    }
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 1000);
    const cursor = searchParams.get("cursor") || undefined;
    
    // Fetch all captchas using flow queries (cursor-based pagination)
    const result = await getAllVerificationCodes({ limit, cursor });
    
    return NextResponse.json({
      captchas: result.data,
      pagination: {
        hasMore: result.hasMore,
        cursor: result.cursor,
        limit,
      },
    });
    
  } catch (error) {
    console.error("Captchas API error:", error);
    
    return NextResponse.json(
      { message: "服务器错误", captchas: [], pagination: { hasMore: false, limit: 100 } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/captchas
 * Generate new verification codes
 * 
 * Request body:
 *   - count: Number of codes to generate (default: 10, max: 1000)
 *   - length: Code length (default: 6)
 *   - expirationDays: Expiration in days (default: 30)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Admin authentication check
    const adminSecret = request.headers.get("X-Admin-Secret");
    const expectedSecret = process.env.ADMIN_SECRET;
    
    if (expectedSecret && adminSecret !== expectedSecret) {
      return NextResponse.json(
        { message: "未授权" },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const count = Math.min(parseInt(body.count, 10) || 10, 1000);
    const length = parseInt(body.length, 10) || 6;
    const expirationDays = parseInt(body.expirationDays, 10) || 30;
    
    // Generate new captchas with deduplication
    const result = await generateCaptchas(count, { length, expirationDays });
    
    return NextResponse.json({
      success: result.success,
      generated: result.generated,
      codes: result.codes,
      message: result.message,
    });
    
  } catch (error) {
    console.error("Generate captchas API error:", error);
    
    return NextResponse.json(
      { success: false, message: "服务器错误", generated: 0, codes: [] },
      { status: 500 }
    );
  }
}

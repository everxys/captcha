import { NextRequest, NextResponse } from "next/server";
import { deleteVerificationCodes, expireVerificationCodes, getAllVerificationCodes, generateCaptchas, searchVerificationCodes } from "@/lib/kv";

export const runtime = "nodejs";

function requireAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function isAdminAuthorized(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expectedSecret = requireAdminSecret();
  if (!expectedSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "服务器未配置 ADMIN_SECRET" },
        { status: 500 }
      ),
    };
  }

  const adminSecret = request.headers.get("X-Admin-Secret");
  if (adminSecret !== expectedSecret) {
    return { ok: false, response: NextResponse.json({ message: "未授权" }, { status: 401 }) };
  }

  return { ok: true };
}

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
    const auth = isAdminAuthorized(request);
    if (!auth.ok) return auth.response;
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 1000);
    const cursor = searchParams.get("cursor") || undefined;

    if (q) {
      const result = await searchVerificationCodes({ query: q, limit });
      return NextResponse.json({
        captchas: result.data,
        pagination: {
          hasMore: false,
          cursor: undefined,
          limit,
        },
      });
    }
    
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
    const auth = isAdminAuthorized(request);
    if (!auth.ok) return auth.response;
    
    // Parse request body
    const body = await request.json();
    const count = Math.min(parseInt(body.count, 10) || 10, 1000);
    const length = parseInt(body.length, 10) || 6;
    const expirationMinutes = parseInt(body.expirationMinutes, 10);
    const expirationDays = parseInt(body.expirationDays, 10);
    
    // Generate new captchas with deduplication
    const result = await generateCaptchas(count, {
      length,
      expirationMinutes: Number.isFinite(expirationMinutes) ? expirationMinutes : undefined,
      expirationDays: Number.isFinite(expirationDays) ? expirationDays : undefined,
    });
    
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = isAdminAuthorized(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const codes = Array.isArray(body?.codes) ? body.codes : [];

    const result = await deleteVerificationCodes(codes);
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    console.error("Delete captchas API error:", error);

    return NextResponse.json(
      { success: false, message: "服务器错误", deleted: 0 },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = isAdminAuthorized(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";
    const codes = Array.isArray(body?.codes) ? body.codes : [];

    if (action !== "expire") {
      return NextResponse.json({ success: false, message: "不支持的操作" }, { status: 400 });
    }

    const result = await expireVerificationCodes(codes);
    return NextResponse.json({ success: true, expired: result.expired });
  } catch (error) {
    console.error("Patch captchas API error:", error);

    return NextResponse.json(
      { success: false, message: "服务器错误", expired: 0 },
      { status: 500 }
    );
  }
}

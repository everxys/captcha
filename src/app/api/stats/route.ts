import { NextRequest, NextResponse } from "next/server";
import { getVerificationStats } from "@/lib/kv";

export const runtime = "nodejs";

function requireAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/**
 * GET /api/stats
 * Get verification code statistics
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Simple admin check - in production use proper auth
    const adminSecret = request.headers.get("X-Admin-Secret");
    
    // Check for simple admin secret (in production, use proper auth)
    const expectedSecret = requireAdminSecret();

    if (!expectedSecret) {
      return NextResponse.json(
        { message: "服务器未配置 ADMIN_SECRET" },
        { status: 500 }
      );
    }
    
    if (adminSecret !== expectedSecret) {
      return NextResponse.json(
        { message: "未授权" },
        { status: 401 }
      );
    }
    
    const stats = await getVerificationStats();
    
    return NextResponse.json(stats);
    
  } catch (error) {
    console.error("Stats API error:", error);
    
    return NextResponse.json(
      { total: 0, used: 0, unused: 0, expired: 0, message: "服务器错误" },
      { status: 500 }
    );
  }
}

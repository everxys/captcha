import { NextRequest, NextResponse } from "next/server";
import { getVerificationStats } from "@/lib/kv";

export const runtime = "nodejs";

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
    const expectedSecret = process.env.ADMIN_SECRET;
    
    if (expectedSecret && adminSecret !== expectedSecret) {
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
      { total: 0, used: 0, unused: 0, message: "服务器错误" },
      { status: 500 }
    );
  }
}

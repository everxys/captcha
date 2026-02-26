import { NextRequest, NextResponse } from "next/server";
import { getVerificationStats } from "@/lib/kv";

export const runtime = "edge";

/**
 * GET /api/stats
 * Get verification code statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
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
    
    // Get environment bindings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = process.env as any;
    
    // Get actual stats from KV
    const stats = await getVerificationStats(env);
    
    return NextResponse.json(stats);
    
  } catch (error) {
    console.error("Stats API error:", error);
    
    return NextResponse.json(
      { total: 0, used: 0, unused: 0, message: "服务器错误" },
      { status: 500 }
    );
  }
}

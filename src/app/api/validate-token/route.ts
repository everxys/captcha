import { NextRequest, NextResponse } from "next/server";
import { validateTokenSchema } from "@/lib/schemas";
import { verifyToken, getTokenFromHeader } from "@/lib/jwt";

/**
 * POST /api/validate-token
 * Validate a JWT token
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    // Try to get token from header first, then from body
    const authHeader = request.headers.get("Authorization");
    let token = getTokenFromHeader(authHeader);
    
    if (!token) {
      // Try from body
      const body = await request.json();
      const validation = validateTokenSchema.safeParse(body);
      
      if (!validation.success) {
        return NextResponse.json(
          { valid: false, message: "Token不能为空" },
          { status: 400 }
        );
      }
      
      token = validation.data.token;
    }
    
    // Verify token
    const payload = await verifyToken(token || "");
    
    if (!payload) {
      return NextResponse.json(
        { valid: false, message: "Token无效" },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      valid: true,
      message: "Token有效",
    });
    
  } catch (error) {
    console.error("Validate token API error:", error);
    
    return NextResponse.json(
      { valid: false, message: "服务器错误" },
      { status: 500 }
    );
  }
}

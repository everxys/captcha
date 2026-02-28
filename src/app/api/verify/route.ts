import { NextRequest, NextResponse } from "next/server";
import { verifyRequestSchema } from "@/lib/schemas";
import { getVerificationCode, markCodeUsed } from "@/lib/kv";
import { generateToken } from "@/lib/jwt";

export const runtime = "nodejs";

/**
 * POST /api/verify
 * Verify a verification code and issue JWT token
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
  // Rate limiting check (disabled for testing)
    // const clientIP = getClientIP(request);
    // if (isRateLimited(clientIP, 5, 60000)) {
    //   return NextResponse.json(
    //     { success: false, message: "请求过于频繁，请稍后再试" },
    //     { status: 429 }
    //   );
    // }

    // Parse and validate request body
    const body = await request.json();
    const validation = verifyRequestSchema.safeParse(body);
    
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message);
      return NextResponse.json(
        { success: false, message: errors[0] || "输入验证失败" },
        { status: 400 }
      );
    }
    
    const { code, deviceId } = validation.data;
    
    const codeData = await getVerificationCode(code);
    
    // Check if code exists
    if (!codeData) {
      return NextResponse.json(
        { success: false, message: "验证码无效" },
        { status: 400 }
      );
    }
    
    // Check if code is already used
    if (codeData.status === "used") {
      return NextResponse.json(
        { success: false, message: "验证码已被使用" },
        { status: 400 }
      );
    }

    // Check if code is expired (manually expired or derived)
    if (codeData.status === "expired") {
      return NextResponse.json(
        { success: false, message: "验证码已过期" },
        { status: 400 }
      );
    }
    
    // Check if code is expired
    if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
      return NextResponse.json(
        { success: false, message: "验证码已过期" },
        { status: 400 }
      );
    }
    
    // Mark code as used (best-effort atomic: only updates when status is still unused)
    const usedAt = Date.now();
    const ok = await markCodeUsed(code, { usedAt, deviceId: deviceId || null });
    if (!ok) {
      const latest = await getVerificationCode(code);
      if (latest?.status === "used") {
        return NextResponse.json(
          { success: false, message: "验证码已被使用" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, message: "验证码状态更新失败，请重试" },
        { status: 409 }
      );
    }
    
    // Generate JWT token
    const token = await generateToken(code, deviceId);
    
    return NextResponse.json({
      success: true,
      message: "验证成功",
      token,
    });
    
  } catch (error) {
    console.error("Verify API error:", error);
    
    return NextResponse.json(
      { success: false, message: "服务器错误，请稍后重试" },
      { status: 500 }
    );
  }
}

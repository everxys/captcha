import { NextRequest, NextResponse } from "next/server";
import { verifyRequestSchema } from "@/lib/schemas";
import { getVerificationCode, updateCodeStatus } from "@/lib/kv";
import { generateToken } from "@/lib/jwt";
import { isRateLimited, getClientIP } from "@/lib/rate-limit";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

function getEnv(): Record<string, unknown> {
  try {
    return getRequestContext().env as unknown as Record<string, unknown>;
  } catch {
    return process.env as unknown as Record<string, unknown>;
  }
}

/**
 * POST /api/verify
 * Verify a verification code and issue JWT token
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
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
    
    const env = getEnv();
    
    // Get the verification code from KV
    const codeData = await getVerificationCode(code, env);
    
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
    
    // Check if code is expired
    if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
      return NextResponse.json(
        { success: false, message: "验证码已过期" },
        { status: 400 }
      );
    }
    
    // Mark code as used
    await updateCodeStatus(
      code, 
      { 
        status: "used", 
        usedAt: Date.now(), 
        deviceId: deviceId || undefined 
      }, 
      env
    );
    
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

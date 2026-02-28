import { NextRequest, NextResponse } from "next/server";
import { generateCaptchas, getVerificationCode } from "@/lib/kv";

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
 * POST /api/code
 * Generate a single verification code and return it.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = isAdminAuthorized(request);
    if (!auth.ok) return auth.response;

    const result = await generateCaptchas(1, { length: 6 });
    const code = result.codes?.[0];

    if (!result.success || !code) {
      return NextResponse.json(
        { success: false, message: result.message || "生成失败" },
        { status: 500 }
      );
    }

    const record = await getVerificationCode(code);

    return NextResponse.json({
      success: true,
      code,
      expiresAt: record?.expiresAt ?? Date.now() + 30 * 60 * 1000,
      message: "生成成功",
    });
  } catch (error) {
    console.error("Issue single code API error:", error);

    return NextResponse.json(
      { success: false, message: "服务器错误" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}

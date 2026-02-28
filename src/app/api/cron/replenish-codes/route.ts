import { NextRequest, NextResponse } from "next/server";
import { generateCaptchas, getVerificationStats } from "@/lib/kv";

export const runtime = "nodejs";

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
}

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron will set this header automatically for scheduled executions.
  // Note: this is not a cryptographic signature; keep CRON_SECRET for manual triggers if needed.
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) return true;

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const bearer = getBearerToken(request);
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === secret || headerSecret === secret;
}

/**
 * Vercel Cron entrypoint:
 * - If unused codes < 1000, generate 1000 more.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const before = await getVerificationStats();
  const threshold = 1000;
  const batch = 1000;

  if (before.unused >= threshold) {
    return NextResponse.json({ ok: true, action: "noop", before });
  }

  const result = await generateCaptchas(batch);
  const after = await getVerificationStats();

  return NextResponse.json({
    ok: result.success,
    action: "generated",
    before,
    after,
    generated: result.generated,
    message: result.message,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}

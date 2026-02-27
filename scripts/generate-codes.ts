/**
 * Script to generate verification codes and store them in Supabase (PostgREST)
 * Usage: npx tsx scripts/generate-codes.ts [count]
 * 
 * Example:
 *   npx tsx scripts/generate-codes.ts 1000
 * 
 * Env:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SUPABASE_CODES_TABLE (optional, default: verification_codes)
 */

/**
 * Characters allowed in verification codes
 * Excluded confusing characters: 0, O, I, 1
 */
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Default expiration time: 30 days (in milliseconds)
 */
const DEFAULT_EXPIRATION_DAYS = 30;

/**
 * Generate a random verification code
 */
function generateCode(length: number = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/**
 * Generate multiple unique codes
 */
function generateCodes(count: number): string[] {
  const codes = new Set<string>();
  
  while (codes.size < count) {
    codes.add(generateCode());
  }
  
  return Array.from(codes);
}

/**
 * Print usage instructions
 */
function printInstructions(codes: string[], expirationDays: number): void {
  const expiresAt = Date.now() + expirationDays * 24 * 60 * 60 * 1000;
  
  console.log("\n=== 生成完成 ===");
  console.log(`生成了 ${codes.length} 个验证码`);
  console.log(`过期时间: ${expirationDays} 天后`);
  console.log("\n使用 Supabase PostgREST 批量插入:");
  console.log("---");

  console.log("1) 先在 Supabase 建表（见项目里的 SQL 模板）");
  console.log("2) 确保已在环境变量里配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  console.log("3) 运行本脚本会自动写入（如果未配置，会只输出示例请求）");

  const samplePayload = codes.slice(0, 3).map((code) => ({
    code,
    status: "unused",
    used_at: null,
    device_id: null,
    expires_at: expiresAt,
  }));

  console.log("\n示例 payload（POST JSON array）:");
  console.log(JSON.stringify(samplePayload, null, 2));
}

async function insertToSupabase(codes: string[], expirationDays: number): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const table = process.env.SUPABASE_CODES_TABLE?.trim() || "verification_codes";

  if (!supabaseUrl || !serviceKey) return;

  const expiresAt = Date.now() + expirationDays * 24 * 60 * 60 * 1000;

  const rows = codes.map((code) => ({
    code,
    status: "unused",
    used_at: null,
    device_id: null,
    expires_at: expiresAt,
  }));

  const res = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed: ${res.status} ${text}`);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0], 10) || 100;
  const expirationDays = parseInt(args[1], 10) || DEFAULT_EXPIRATION_DAYS;
  
  console.log(`正在生成 ${count} 个验证码...`);
  
  const codes = generateCodes(count);
  
  console.log(`生成了 ${codes.length} 个唯一验证码`);
  console.log(`示例验证码: ${codes.slice(0, 5).join(", ")}`);
  
  try {
    await insertToSupabase(codes, expirationDays);
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("已写入 Supabase ✅");
    }
  } catch (e) {
    console.error("写入 Supabase 失败（将只输出导入说明）:", e);
  }

  printInstructions(codes, expirationDays);
}

main().catch(console.error);

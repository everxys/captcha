/**
 * Script to generate verification codes and store them in Supabase (PostgREST)
 * Usage: node scripts/generate-codes.mjs [count] [expirationMinutes]
 *
 * Env:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SUPABASE_CODES_TABLE (optional, default: verification_codes)
 */

import fs from "node:fs";
import path from "node:path";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_EXPIRATION_MINUTES = 30;

function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

function generateCodes(count) {
  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateCode());
  }
  return Array.from(codes);
}

function loadDotEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadDotEnvBestEffort() {
  const cwd = process.cwd();
  loadDotEnvFromFile(path.join(cwd, ".env.local"));
  loadDotEnvFromFile(path.join(cwd, ".env"));
}

function printInstructions(codes, expirationMinutes) {
  const expiresAt = Date.now() + expirationMinutes * 60 * 1000;

  console.log("\n=== 生成完成 ===");
  console.log(`生成了 ${codes.length} 个验证码`);
  console.log(`过期时间: ${expirationMinutes} 分钟后`);
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

async function insertToSupabase(codes, expirationMinutes) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const table = process.env.SUPABASE_CODES_TABLE?.trim() || "verification_codes";

  if (!supabaseUrl || !serviceKey) {
    console.warn("未检测到 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，跳过写入 Supabase。");
    return false;
  }

  if (supabaseUrl.startsWith("postgres://") || supabaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "SUPABASE_URL 配置错误：请填 Supabase 的 Project URL（形如 https://<project-ref>.supabase.co），不要填 Postgres 连接串（postgresql://...）。"
    );
  }

  const expiresAt = Date.now() + expirationMinutes * 60 * 1000;

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

  return true;
}

async function main() {
  loadDotEnvBestEffort();

  const args = process.argv.slice(2);
  const count = parseInt(args[0], 10) || 100;
  const expirationMinutes = parseInt(args[1], 10) || DEFAULT_EXPIRATION_MINUTES;

  console.log(`正在生成 ${count} 个验证码...`);

  const codes = generateCodes(count);

  console.log(`生成了 ${codes.length} 个唯一验证码`);
  console.log(`示例验证码: ${codes.slice(0, 5).join(", ")}`);

  try {
    const inserted = await insertToSupabase(codes, expirationMinutes);
    if (inserted) console.log("已写入 Supabase ✅");
  } catch (e) {
    console.error("写入 Supabase 失败（将只输出导入说明）:", e);
  }

  printInstructions(codes, expirationMinutes);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

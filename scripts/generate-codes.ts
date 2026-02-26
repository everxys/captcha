/**
 * Script to generate verification codes and store them in Cloudflare KV
 * Usage: npx tsx scripts/generate-codes.ts [count]
 * 
 * Example:
 *   npx tsx scripts/generate-codes.ts 1000
 * 
 * Note: This script should be run with wrangler CLI for production use.
 * The actual KV operations are done via wrangler CLI commands.
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
  console.log("\n使用 wrangler CLI 导入 KV:");
  console.log("---");
  
  for (const code of codes.slice(0, 10)) {
    const data = JSON.stringify({
      code,
      status: "unused",
      usedAt: null,
      deviceId: null,
      expiresAt,
    }).replace(/"/g, '\\"');
    console.log(`wrangler kv:key put "code:${code}" "${data}" --namespace-id=YOUR_KV_NAMESPACE_ID`);
  }
  
  if (codes.length > 10) {
    console.log(`... 还有 ${codes.length - 10} 个验证码`);
    console.log("\n批量导入建议:");
    console.log("1. 将验证码导出为 JSON 文件");
    console.log("2. 使用 wrangler kv:bulk put 命令导入");
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
  
  printInstructions(codes, expirationDays);
}

main().catch(console.error);

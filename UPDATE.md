# 更新日志

## v1.0.0 (2026-02-18)

### 新增功能

1. **验证码验证系统**
   - 6位验证码输入（自动大写）
   - 设备指纹绑定，防止多人共享
   - JWT Token签发（30天有效期）

2. **API接口**
   - `POST /api/verify` - 验证码验证
   - `POST /api/validate-token` - Token验证
   - `GET /api/stats` - 使用统计

3. **前端页面**
   - `/verify` - 验证码输入页面
   - `/app` - 受保护的问卷页面
   - 自动跳转和Token存储

4. **安全特性**
   - 速率限制（每IP每分钟5次）
   - 设备绑定
   - JWT签名验证

### 技术栈

- Next.js 14+ (App Router)
- TypeScript (严格模式)
- Cloudflare KV 存储
- Cloudflare Pages 部署
- Tailwind CSS + shadcn/ui

### 部署步骤

1. 安装依赖：`npm install`
2. 配置环境变量：复制 `.env.example` 为 `.env` 并设置 `JWT_SECRET`
3. 设置Cloudflare secrets：
   ```bash
   wrangler secret put JWT_SECRET
   ```
4. 部署到Cloudflare Pages：
   ```bash
   npx wrangler pages deploy .next
   ```

### 验证码生成

```bash
# 生成1000个验证码
npm run generate-codes 1000
```

或使用wrangler手动写入KV：
```bash
wrangler kv:key put "code:ABC123" '{"code":"ABC123","status":"unused","usedAt":null,"deviceId":null,"expiresAt":1737158400000}' --namespace-id=0b946189adfb4121a7f31d32603ebbde
```

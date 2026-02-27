# 更新日志

## v1.1.0 (2026-02-27)

### 变更

1. **部署目标调整**
   - 前端改为适配 Vercel 部署（移除 Cloudflare Pages 本地开发脚本，去掉 next-on-pages 运行时依赖）

2. **数据存储迁移到 Supabase**
   - 用 Supabase PostgREST 替代 Cloudflare KV：验证码读取/分页/统计/生成/核销
   - 新增 Supabase 建表 SQL：`scripts/supabase-schema.sql`

3. **工程清理/重构**
   - 添加 `vercel.json`，删除 `wrangler.toml`
   - 移除 `@cloudflare/next-on-pages` / `wrangler` 依赖与相关脚本
   - API Route handlers 统一为 Node.js runtime，并清理无用参数签名

## v1.0.1 (2026-02-27)

### 修复

1. **验证码管理登录输入**
   - 管理员密钥密码框可正常输入（含字母 `a` 的扩展快捷键冲突场景）
   - 回车与点击“登录”均可触发登录

2. **Pages 本地开发的 KV 绑定**
   - `npm run pages:dev` 显式绑定 `CAPTCHA_KV`，避免 KV 缺失导致退回内存存储

3. **验证码管理页刷新闪现登录**
   - 挂载后再读取 `localStorage`，首屏显示“加载中”占位，避免 SSR/CSR 不一致导致 hydration 报错

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

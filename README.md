# 问卷验证系统 (Quiz Access Control)

付费问卷验证系统，基于验证码的访问控制应用。

## 功能特性

- 🔐 **验证码验证** - 用户输入验证码获取访问权限
- 📱 **设备绑定** - 验证码与设备指纹绑定，防止重复使用
- ⏰ **时效控制** - 验证码支持过期时间设置
- 🔒 **JWT 认证** - 验证成功后颁发 30 天有效期的 JWT token
- 🛡️ **速率限制** - API 接口防刷保护
- 📊 **数据统计** - 验证码使用情况统计

## 技术栈

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + shadcn/ui
- **存储**: Cloudflare KV
- **部署**: Cloudflare Pages
- **认证**: JWT (jose)

## 项目结构

```
captcha/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API 路由
│   │   │   ├── verify/         # 验证码验证
│   │   │   ├── validate-token/ # Token 验证
│   │   │   └── stats/          # 统计数据
│   │   ├── verify/             # 验证页面
│   │   ├── app/                # 受保护问卷页面
│   │   └── layout.tsx          # 根布局
│   ├── lib/                    # 工具库
│   │   ├── kv.ts               # Cloudflare KV 操作
│   │   ├── jwt.ts              # JWT 生成验证
│   │   ├── rate-limit.ts       # 速率限制
│   │   ├── schemas.ts          # Zod 验证模式
│   │   └── types.ts            # 类型定义
│   └── middleware.ts            # 路由保护中间件
├── public/                     # 静态资源
├── wrangler.toml              # Cloudflare 配置
└── package.json
```

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
# 方式1: 使用 Next.js 开发服务器 (推荐本地开发)
npm run dev
# 访问 http://localhost:3000

# 方式2: 使用 Cloudflare Pages 本地模拟
npx wrangler pages dev .next --port 3000
```

### 构建部署

```bash
# 构建生产版本
npm run build

# 部署到 Cloudflare Pages
npx wrangler pages deploy .next
```

## 环境变量

创建 `.env.local` 文件：

```env
# JWT 密钥 (生产环境必须设置)
JWT_SECRET=your-secret-key-here

# Cloudflare KV (生产环境通过 wrangler.toml 配置)
# QUIZ_CODES=<kv-binding>
```

## 验证码管理

### 生成验证码

使用 Cloudflare Dashboard 或 API 添加验证码到 KV 存储：

```bash
# 使用 wrangler CLI
npx wrangler kv:key put "code:TEST01" '{"code":"TEST01","status":"unused","usedAt":null,"deviceId":null,"expiresAt":1737158400000}' --namespace-id=YOUR_KV_NAMESPACE_ID
```

### 验证码格式

```typescript
interface VerificationCode {
  code: string;        // 验证码 (如 "TEST01")
  status: "unused" | "used";  // 使用状态
  usedAt: number | null;       // 使用时间戳
  deviceId: string | null;     // 绑定的设备ID
  expiresAt: number;          // 过期时间戳
}
```

## API 接口

### POST /api/verify

验证验证码并获取 JWT token

```bash
curl -X POST http://localhost:3000/api/verify/ \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST01","deviceId":"device-fingerprint"}'
```

响应：
```json
{
  "success": true,
  "message": "验证成功",
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

### POST /api/validate-token

验证 JWT token 有效性

```bash
curl -X POST http://localhost:3000/api/validate-token/ \
  -H "Authorization: Bearer <token>"
```

### GET /api/stats

获取验证码使用统计

```bash
curl http://localhost:3000/api/stats/
```

### GET /api/captchas

获取所有验证码列表 (使用 flow queries 优化性能)

```bash
# 获取验证码列表 (默认 100 条)
curl http://localhost:3000/api/captchas/

# 自定义分页参数
curl "http://localhost:3000/api/captchas/?limit=50"

# 使用游标分页
curl "http://localhost:3000/api/captchas/?cursor=xxx"
```

查询参数：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 100 | 每页数量 (最大 1000) |
| `cursor` | string | - | 分页游标 |

响应：
```json
{
  "captchas": [
    {"code": "TEST01", "status": "unused", "usedAt": null, "deviceId": null, "expiresAt": 1737158400000}
  ],
  "pagination": {
    "hasMore": false,
    "cursor": "...",
    "limit": 100
  }
}
```

**注意:** 需要设置 `X-Admin-Secret` 请求头进行管理员认证

### POST /api/captchas

生成新的验证码

```bash
# 生成 10 个验证码
curl -X POST http://localhost:3000/api/captchas/ \
  -H "Content-Type: application/json" \
  -d '{"count": 10}'

# 生成 100 个验证码，自定义长度和过期时间
curl -X POST http://localhost:3000/api/captchas/ \
  -H "Content-Type: application/json" \
  -d '{"count": 100, "length": 6, "expirationDays": 30}'
```

请求体：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `count` | number | 10 | 生成数量 (最大 1000) |
| `length` | number | 6 | 验证码长度 |
| `expirationDays` | number | 30 | 过期天数 |

响应：
```json
{
  "success": true,
  "generated": 10,
  "codes": ["ABC123", "DEF456", ...],
  "message": "成功生成 10 个验证码"
}
```

**注意:** 需要设置 `X-Admin-Secret` 请求头进行管理员认证

## 页面路由

- `/` - 首页 (重定向到 /verify)
- `/verify` - 验证码输入页面
- `/captchas` - 验证码管理页面 (管理员)
- `/app` - 受保护的问卷页面 (需要登录)

## 生产部署

### 1. 创建 Cloudflare 账户并绑定 KV

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create QUIZ_CODES

# 将 ID 添加到 wrangler.toml
```

### 2. 配置环境变量

```bash
# 设置 JWT 密钥
npx wrangler secret put JWT_SECRET
```

### 3. 部署

```bash
npm run build
npx wrangler pages deploy .next
```

## 许可证

MIT

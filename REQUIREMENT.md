# 角色设定
你是一位精通 Next.js 14+ (App Router)、TypeScript 和 Cloudflare 生态系统的资深全栈工程师。
你的任务是构建一个**生产级**的"验证码访问控制系统"，用于付费问卷调查应用。
要求代码结构清晰、安全、可扩展，**一次性达到生产标准，无需后期重构**。

# 项目背景
用户通过小红书支付 1.99 元后获得一个验证码，在网页输入验证码验证通过后，获得访问问卷调查应用的权限。
验证状态需要持久化，防止多人共享同一验证码，且服务器重启后数据不丢失。

# 技术栈要求
- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript (严格模式)
- **存储**: Cloudflare KV (用于存储验证码状态)
- **部署**: Cloudflare Pages
- **样式**: Tailwind CSS
- **UI 组件**: shadcn/ui (用于输入框、按钮、对话框等)
- **图标**: lucide-react

# 核心功能需求

## 1. 验证码数据结构 (Cloudflare KV)
请设计合理的 KV Key-Value 结构，需包含以下字段：
- `code`: string (验证码本身，如 "A7X9B2")
- `status`: 'unused' | 'used' | 'expired'
- `usedAt`: number | null (使用时间戳)
- `deviceId`: string | null (绑定设备指纹，防止共享)
- `expiresAt`: number (过期时间戳，如生成后30天)

## 2. API 接口设计
实现以下 API 路由 (Route Handlers)：

### POST /api/verify
- **功能**: 验证用户输入的验证码
- **输入**: `{ code: string, deviceId: string }`
- **逻辑**:
  1. 检查 KV 中是否存在该 code
  2. 检查是否过期 (expiresAt < now)
  3. 检查状态 (status === 'unused')
  4. 如果是首次使用，绑定 deviceId，更新 status 为 'used'，记录 usedAt
  5. 如果已使用，检查 deviceId 是否匹配 (允许同一设备重复验证)
  6. 验证通过后，签发一个 JWT Token (有效期30天)
- **输出**: `{ success: boolean, token?: string, message: string }`
- **安全**: 添加速率限制 (每IP每分钟最多5次请求)

### POST /api/validate-token
- **功能**: 每次访问应用时验证 JWT Token 是否有效
- **输入**: `{ token: string }` (从 Authorization header 或 body 获取)
- **输出**: `{ valid: boolean, message?: string }`

### GET /api/stats (可选，带简易认证)
- **功能**: 管理员查看验证码使用统计
- **输出**: `{ total: number, used: number, unused: number }`

## 3. 前端页面

### /verify 页面 (验证码输入页)
- 简洁美观的输入界面
- 6位验证码输入框 (自动大写，自动聚焦)
- 显示验证状态 (加载中/成功/失败)
- 验证成功后自动跳转到应用首页
- 本地存储 JWT Token (localStorage)

### 应用保护机制
- 使用 Next.js Middleware 保护 `/app` 下的所有问卷页面
- Middleware 检查 JWT Token，无效则重定向到 /verify
- 白名单路径: `/verify`, `/api/*`

## 4. 验证码生成脚本
创建一个 Node.js 脚本 `scripts/generate-codes.ts`:
- 生成指定数量的随机验证码 (如 1000 个)
- 格式: 6位大写字母+数字混合
- 批量写入 Cloudflare KV
- 设置默认过期时间 (如 30 天)
- 包含错误处理和进度日志

## 5. 配置文件
- `wrangler.toml`: Cloudflare Pages + KV 绑定配置
- `.env.example`: 环境变量模板 (JWT_SECRET, KV_BINDING_NAME 等)

# 安全要求
1. **JWT 签名**: 使用强随机密钥，存储在环境变量
2. **速率限制**: API 层面防止暴力破解 (使用 @cloudflare/ratelimiter 或简单内存限制)
3. **设备绑定**: 验证码首次使用后绑定 deviceId，防止多人共享
4. **输入验证**: 所有 API 输入使用 Zod 进行 schema 验证
5. **错误信息**: 不泄露敏感信息 (如不提示"验证码存在但已过期")

# 边界情况处理
1. 验证码大小写不敏感 (输入 "a7x9b2" 应匹配 "A7X9B2")
2. KV 读写失败时的优雅降级和错误提示
3. Token 过期后的自动跳转重新验证
4. 网络中断时的用户友好提示
5. 并发请求同一验证码的处理 (使用 KV 的原子操作)

# 输出要求
1. **完整的项目目录结构树**
2. **所有核心文件的完整代码** (不要省略，不要写 "// ... rest of code")
3. **wrangler.toml 配置示例**
4. **package.json 依赖列表**
5. **部署步骤说明** (从创建 KV 到部署 Pages 的完整流程)
6. **验证码生成和导入的使用说明**

# 额外考虑
- 代码需符合 ESLint 最佳实践
- 使用 async/await 处理异步操作
- 所有函数添加 JSDoc 注释
- 考虑未来扩展: 可能支持批量导入验证码、验证码导出、使用记录查询

请开始生成完整的实现方案。
# 验证码服务部署文档

默认服务域名：`https://captcha.everxys.top`

## 1. 环境变量

至少配置以下变量：

```env
JWT_SECRET=your-strong-random-secret
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
ADMIN_SECRET=your-admin-secret
```

可选：

```env
SUPABASE_CODES_TABLE=verification_codes
NEXT_PUBLIC_APP_URL=https://captcha.everxys.top
```

## 2. 数据库初始化（Supabase）

在 Supabase SQL Editor 执行：

```sql
-- 文件：scripts/supabase-schema.sql
create table if not exists public.verification_codes (
  code text primary key,
  status text not null check (status in ('unused', 'used', 'expired')),
  used_at bigint null,
  device_id text null,
  expires_at bigint not null
);

create index if not exists verification_codes_status_idx on public.verification_codes (status);
create index if not exists verification_codes_expires_at_idx on public.verification_codes (expires_at);
```

## 3. 本地启动

```bash
npm ci
npm run dev
```

默认本地地址：`http://localhost:8788`

## 4. 生产部署

```bash
npm ci
npm run build
```

将环境变量配置到部署平台后发布（Vercel/其他 Node 平台均可）。

## 5. 部署后检查

1. 管理接口鉴权检查（应返回 401）：

```bash
curl -i "https://captcha.everxys.top/api/code"
```

2. 管理接口鉴权成功检查（应返回成功 JSON）：

```bash
curl -X POST "https://captcha.everxys.top/api/code" \
  -H "X-Admin-Secret: your-admin-secret"
```

3. 验证接口可用性检查：

```bash
curl -X POST "https://captcha.everxys.top/api/verify" \
  -H "Content-Type: application/json" \
  -d '{"code":"AAAAAA","deviceId":"health-check-device"}'
```


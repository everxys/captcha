# 验证码服务对接文档

默认服务域名：`https://captcha.everxys.top`

本项目可作为独立「验证码服务」被其他项目调用，核心只需要两个接口：

1. 生成验证码：`POST /api/code`
2. 验证验证码：`POST /api/verify`

## 1. 对接模式

建议把本项目独立部署成一个服务，业务系统通过 HTTP 调用。

- 管理端调用生成接口（需要管理员密钥）。
- 用户端调用验证接口（不需要管理员密钥）。

部署细节见 `DEPLOYMENT.md`。

## 2. 生成验证码接口（供其他系统后台调用）

### 请求

- Method: `POST`
- URL: `/api/code`
- Header: `X-Admin-Secret: <ADMIN_SECRET>`

### 示例

```bash
curl -X POST "https://captcha.everxys.top/api/code" \
  -H "X-Admin-Secret: your-admin-secret"
```

### 成功响应示例

```json
{
  "success": true,
  "code": "A7X9B2",
  "expiresAt": 1760000000000,
  "message": "生成成功"
}
```

说明：

- `code`：本次生成的验证码。
- `expiresAt`：毫秒时间戳。
- 当前默认有效期为 30 分钟，未使用自动过期。

## 3. 验证验证码接口（供业务前端/后端调用）

### 请求

- Method: `POST`
- URL: `/api/verify`
- Header: `Content-Type: application/json`
- Body:

```json
{
  "code": "A7X9B2",
  "deviceId": "device-unique-id"
}
```

### 示例

```bash
curl -X POST "https://captcha.everxys.top/api/verify" \
  -H "Content-Type: application/json" \
  -d '{"code":"A7X9B2","deviceId":"user-device-001"}'
```

### 成功响应示例

```json
{
  "success": true,
  "message": "验证成功",
  "token": "eyJhbGciOi..."
}
```

### 失败响应（常见）

- `400`：验证码无效 / 已使用 / 已过期 / 参数错误
- `409`：验证码状态更新冲突（可重试一次）
- `500`：服务端错误

## 4. 调用建议（业务系统）

- 生成接口只在服务端调用，不要暴露 `ADMIN_SECRET` 到前端。
- 验证成功后，业务系统可以保存返回的 `token` 作为登录态或二次校验凭据。
- 遇到 `409` 可做一次短暂延迟后重试。
- 建议业务系统记录验证码下发与验证日志（请求时间、业务用户 ID、结果）。

## 5. Node.js 对接示例

```ts
const CAPTCHA_BASE_URL = "https://captcha.everxys.top";

export async function issueCaptcha() {
  const res = await fetch(`${CAPTCHA_BASE_URL}/api/code`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": process.env.CAPTCHA_ADMIN_SECRET!,
    },
  });
  if (!res.ok) throw new Error(`issue failed: ${res.status}`);
  return res.json();
}

export async function verifyCaptcha(code: string, deviceId: string) {
  const res = await fetch(`${CAPTCHA_BASE_URL}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, deviceId }),
  });
  return res.json();
}
```

## 7. 其他可用管理接口（可选）

- `GET /api/codes`：分页/搜索查询（需 `X-Admin-Secret`）
- `DELETE /api/codes`：批量删除（需 `X-Admin-Secret`）
- `PATCH /api/codes`：批量手动过期（需 `X-Admin-Secret`，`action=expire`）

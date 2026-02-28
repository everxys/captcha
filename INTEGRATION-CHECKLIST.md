# 第三方最小对接清单

服务域名（默认）：`https://captcha.everxys.top`

## 1. 必要约定

- 接口返回 `application/json`
- 验证码生成接口仅服务端调用，不能暴露管理员密钥
- 验证码默认有效期 30 分钟，未使用自动过期

## 2. 生成验证码（后台调用）

- Method: `POST`
- URL: `/api/code`
- Header: `X-Admin-Secret: <CAPTCHA_ADMIN_SECRET>`

示例：

```bash
curl -X POST "https://captcha.everxys.top/api/code" \
  -H "X-Admin-Secret: your-admin-secret"
```

成功响应：

```json
{
  "success": true,
  "code": "A7X9B2",
  "expiresAt": 1760000000000,
  "message": "生成成功"
}
```

## 3. 验证验证码（前台或后台调用）

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

示例：

```bash
curl -X POST "https://captcha.everxys.top/api/verify" \
  -H "Content-Type: application/json" \
  -d '{"code":"A7X9B2","deviceId":"user-device-001"}'
```

成功响应：

```json
{
  "success": true,
  "message": "验证成功",
  "token": "eyJhbGciOi..."
}
```

## 4. 错误处理约定

- `400`：参数错误 / 验证码无效 / 已使用 / 已过期
- `401`：管理员接口鉴权失败（仅生成/管理接口）
- `409`：验证码并发状态冲突（建议延迟后重试一次）
- `500`：服务端异常（记录日志并提示稍后重试）

建议处理策略：

1. 只有 `409` 做一次重试。
2. `400` 直接给用户可理解提示。
3. `5xx` 统一降级提示并上报日志。

## 5. 生产接入前自检

1. 管理员密钥是否只保存在服务端环境变量。
2. 业务日志是否记录：请求时间、业务用户 ID、code、响应状态。
3. 是否对调用超时做保护（建议 3-5 秒）。
4. 是否对 `token` 存储位置和有效期有统一策略。


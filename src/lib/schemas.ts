import { z } from "zod";

/**
 * Verification request schema
 */
export const verifyRequestSchema = z.object({
  code: z
    .string()
    .min(6, "验证码长度不能少于6位")
    .max(6, "验证码长度不能超过6位")
    .transform((val) => val.toUpperCase()),
  deviceId: z.string().min(1, "设备ID不能为空"),
});

/**
 * Token validation request schema
 */
export const validateTokenSchema = z.object({
  token: z.string().min(1, "Token不能为空"),
});

/**
 * Type exports for request bodies
 */
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
export type ValidateTokenRequest = z.infer<typeof validateTokenSchema>;

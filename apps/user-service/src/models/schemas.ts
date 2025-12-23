import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  displayName: z.string().min(1).optional()
});

export const ConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4)
});

export const EmailOnlySchema = z.object({
  email: z.string().email()
});

export const ConfirmForgotSchema = z.object({
  email: z.string().email(),
  code: z.string(),
  newPassword: z.string().min(10)
});

export const AdminCreateUserSchema = z.object({
  email: z.string().email(),
  tempPassword: z.string().min(10).optional(),
  displayName: z.string().optional(),
  roles: z.array(z.string()).default([])
});

export const UpdateUserSchema = z.object({
  displayName: z.string().optional(),
  roles: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "DELETED"]).optional()
});

export const MfaSetupSchema = z.object({
  accessToken: z.string().min(20)
});

export const MfaVerifySchema = z.object({
  accessToken: z.string().min(20),
  code: z.string().min(6).max(8),
  deviceName: z.string().optional()
});

export const MfaEnableSchema = z.object({
  accessToken: z.string().min(20),
  enabled: z.boolean()
});

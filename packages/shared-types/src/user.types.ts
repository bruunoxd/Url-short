import { z } from 'zod';

// User entity
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  emailVerified: boolean;
}

// Authentication
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  userId: string;
  email: string;
  permissions: string[];
  iat: number;
  exp: number;
}

// Validation schemas
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).optional()
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional()
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1)
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().email()
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1)
});

export type RegisterRequest = z.infer<typeof RegisterSchema>;
export type LoginRequest = z.infer<typeof LoginSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;
export type VerifyEmailRequest = z.infer<typeof VerifyEmailSchema>;
export type RequestPasswordResetRequest = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;
export type DeleteAccountRequest = z.infer<typeof DeleteAccountSchema>;
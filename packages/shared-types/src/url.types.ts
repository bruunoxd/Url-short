import { z } from 'zod';

// URL entity
export interface ShortUrl {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  title?: string;
  tags: string[];
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// URL statistics
export interface UrlStats {
  totalClicks: number;
  uniqueVisitors: number;
  clicksToday: number;
  clicksThisWeek: number;
  clicksThisMonth: number;
}

// Validation schemas
export const CreateUrlSchema = z.object({
  originalUrl: z.string().url().max(2048),
  title: z.string().min(1).max(255).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).default([]),
  expiresAt: z.string().datetime().optional()
});

export const UpdateUrlSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional()
});

export type CreateUrlRequest = z.infer<typeof CreateUrlSchema>;
export type UpdateUrlRequest = z.infer<typeof UpdateUrlSchema>;

export interface ShortUrlResponse extends ShortUrl {
  stats?: UrlStats;
}
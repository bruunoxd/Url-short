import { z } from 'zod';

// Click event
export interface ClickEvent {
  shortUrlId: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  referrer?: string;
  country?: string;
  city?: string;
  deviceType: string;
  browser: string;
  os: string;
}

// Device and browser info
export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet';
  brand?: string;
  model?: string;
}

export interface BrowserInfo {
  name: string;
  version: string;
}

// Analytics aggregations
export interface AnalyticsData {
  totalClicks: number;
  uniqueVisitors: number;
  clicksByDate: Array<{
    date: string;
    clicks: number;
    uniqueVisitors: number;
  }>;
  clicksByCountry: Array<{
    country: string;
    clicks: number;
    percentage: number;
  }>;
  clicksByDevice: Array<{
    deviceType: string;
    clicks: number;
    percentage: number;
  }>;
  clicksByBrowser: Array<{
    browser: string;
    clicks: number;
    percentage: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    clicks: number;
    percentage: number;
  }>;
}

// Time range for analytics
export const AnalyticsTimeRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day')
});

export type AnalyticsTimeRange = z.infer<typeof AnalyticsTimeRangeSchema>;
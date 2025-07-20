// Analytics types for the frontend
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
export interface AnalyticsTimeRange {
  startDate: string;
  endDate: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

// GeoJSON types for map visualization
export interface GeoFeature {
  type: 'Feature';
  properties: {
    name: string;
    clicks: number;
    percentage: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'click' | 'stats_update';
  data: any;
}

export interface ClickWebSocketMessage extends WebSocketMessage {
  type: 'click';
  data: {
    urlId: string;
    timestamp: string;
    country?: string;
    city?: string;
    deviceType: string;
    browser: string;
  };
}

export interface StatsUpdateWebSocketMessage extends WebSocketMessage {
  type: 'stats_update';
  data: {
    urlId: string;
    totalClicks: number;
    uniqueVisitors: number;
  };
}
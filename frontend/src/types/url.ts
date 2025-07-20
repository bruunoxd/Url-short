// URL entity
export interface ShortUrl {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  title?: string;
  tags: string[];
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// URL statistics
export interface UrlStats {
  totalClicks: number;
  uniqueVisitors: number;
  clicksToday: number;
  clicksThisWeek: number;
  clicksThisMonth: number;
}

// Create URL request
export interface CreateUrlRequest {
  originalUrl: string;
  title?: string;
  tags?: string[];
  expiresAt?: string;
}

// Update URL request
export interface UpdateUrlRequest {
  title?: string;
  tags?: string[];
  isActive?: boolean;
  expiresAt?: string;
}

export interface ShortUrlResponse extends ShortUrl {
  stats?: UrlStats;
}

// URL list response
export interface UrlListResponse {
  urls: ShortUrlResponse[];
  total: number;
  page: number;
  limit: number;
}
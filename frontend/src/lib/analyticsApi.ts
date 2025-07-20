import { AnalyticsData, AnalyticsTimeRange } from '@/types/analytics';
import { toast } from 'react-toastify';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to handle API errors
const handleApiError = (error: unknown) => {
  console.error('API Error:', error);
  if (error instanceof Error) {
    toast.error(error.message);
  } else {
    toast.error('An unexpected error occurred');
  }
  throw error;
};

// Helper function to make authenticated API requests
const fetchWithAuth = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  // Get token from localStorage
  const token = localStorage.getItem('auth_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error);
  }
};

// Analytics API
export const analyticsApi = {
  // Get analytics for a specific URL
  getUrlAnalytics: async (urlId: string, timeRange?: Partial<AnalyticsTimeRange>): Promise<AnalyticsData> => {
    const params = new URLSearchParams();
    
    if (timeRange?.startDate) {
      params.append('startDate', timeRange.startDate);
    }
    
    if (timeRange?.endDate) {
      params.append('endDate', timeRange.endDate);
    }
    
    if (timeRange?.granularity) {
      params.append('granularity', timeRange.granularity);
    }
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await fetchWithAuth(`/api/v1/analytics/${urlId}${queryString}`);
    return response.data;
  },

  // Get geographic distribution for a URL
  getGeographicDistribution: async (urlId: string): Promise<{
    countries: Array<{ country: string; clicks: number; percentage: number }>;
  }> => {
    const response = await fetchWithAuth(`/api/v1/analytics/${urlId}/geo`);
    return response.data;
  },

  // Get device breakdown for a URL
  getDeviceBreakdown: async (urlId: string): Promise<{
    devices: Array<{ deviceType: string; clicks: number; percentage: number }>;
    browsers: Array<{ browser: string; clicks: number; percentage: number }>;
  }> => {
    const response = await fetchWithAuth(`/api/v1/analytics/${urlId}/devices`);
    return response.data;
  },

  // Get time series data for a URL
  getTimeSeriesData: async (
    urlId: string,
    timeRange?: Partial<AnalyticsTimeRange>
  ): Promise<{
    timeSeries: Array<{ date: string; clicks: number; uniqueVisitors: number }>;
  }> => {
    const params = new URLSearchParams();
    
    if (timeRange?.startDate) {
      params.append('startDate', timeRange.startDate);
    }
    
    if (timeRange?.endDate) {
      params.append('endDate', timeRange.endDate);
    }
    
    if (timeRange?.granularity) {
      params.append('granularity', timeRange.granularity);
    }
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await fetchWithAuth(`/api/v1/analytics/${urlId}/timeseries${queryString}`);
    return response.data;
  },

  // Get referrer data for a URL
  getReferrerData: async (urlId: string): Promise<{
    referrers: Array<{ referrer: string; clicks: number; percentage: number }>;
  }> => {
    const response = await fetchWithAuth(`/api/v1/analytics/${urlId}/referrers`);
    return response.data;
  },
};
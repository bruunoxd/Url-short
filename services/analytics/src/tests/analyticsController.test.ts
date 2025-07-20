import request from 'supertest';
import express from 'express';
import { ClickEventEntity } from '@url-shortener/shared-db';
import {
  getUrlAnalytics,
  getGeographicDistribution,
  getDeviceBreakdown,
  getTimeSeriesData,
  getReferrerData
} from '../controllers/analyticsController';

// Mock the shared-db module
jest.mock('@url-shortener/shared-db', () => ({
  ClickEventEntity: {
    getAnalytics: jest.fn(),
    getClicksByCountry: jest.fn(),
    getClicksByDevice: jest.fn(),
    getClicksByBrowser: jest.fn(),
    getClicksByDateRange: jest.fn(),
    getTopReferrers: jest.fn()
  }
}));

// Mock the shared-monitoring module
jest.mock('@url-shortener/shared-monitoring', () => ({
  databaseQueryDuration: {
    startTimer: jest.fn().mockReturnValue(jest.fn())
  }
}));

describe('Analytics Controller', () => {
  let app: express.Application;
  const validUrlId = '123e4567-e89b-12d3-a456-426614174000';
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.get('/api/v1/analytics/:urlId', getUrlAnalytics);
    app.get('/api/v1/analytics/:urlId/geo', getGeographicDistribution);
    app.get('/api/v1/analytics/:urlId/devices', getDeviceBreakdown);
    app.get('/api/v1/analytics/:urlId/timeseries', getTimeSeriesData);
    app.get('/api/v1/analytics/:urlId/referrers', getReferrerData);
    
    // Reset mocks
    jest.clearAllMocks();
  });
  
  describe('GET /api/v1/analytics/:urlId', () => {
    const mockAnalyticsData = {
      totalClicks: 100,
      uniqueVisitors: 50,
      clicksByDate: [
        { date: '2025-07-01', clicks: 10, uniqueVisitors: 5 },
        { date: '2025-07-02', clicks: 20, uniqueVisitors: 10 }
      ],
      clicksByCountry: [
        { country: 'Brazil', clicks: 50, percentage: 50 },
        { country: 'United States', clicks: 30, percentage: 30 }
      ],
      clicksByDevice: [
        { deviceType: 'desktop', clicks: 60, percentage: 60 },
        { deviceType: 'mobile', clicks: 40, percentage: 40 }
      ],
      clicksByBrowser: [
        { browser: 'Chrome', clicks: 70, percentage: 70 },
        { browser: 'Firefox', clicks: 30, percentage: 30 }
      ],
      topReferrers: [
        { referrer: 'google.com', clicks: 40, percentage: 40 },
        { referrer: 'facebook.com', clicks: 30, percentage: 30 }
      ]
    };
    
    it('should return analytics data for a valid URL ID', async () => {
      // Mock the getAnalytics method
      (ClickEventEntity.getAnalytics as jest.Mock).mockResolvedValue(mockAnalyticsData);
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockAnalyticsData);
      expect(response.body.meta).toBeDefined();
      expect(ClickEventEntity.getAnalytics).toHaveBeenCalledWith(
        validUrlId,
        expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String),
          granularity: 'day'
        })
      );
    });
    
    it('should return 400 for an invalid URL ID', async () => {
      const invalidUrlId = 'invalid-uuid';
      
      const response = await request(app).get(`/api/v1/analytics/${invalidUrlId}`);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_URL_ID');
      expect(ClickEventEntity.getAnalytics).not.toHaveBeenCalled();
    });
    
    it('should handle database errors gracefully', async () => {
      // Mock the getAnalytics method to throw an error
      (ClickEventEntity.getAnalytics as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}`);
      
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
    
    it('should accept custom time range parameters', async () => {
      // Mock the getAnalytics method
      (ClickEventEntity.getAnalytics as jest.Mock).mockResolvedValue(mockAnalyticsData);
      
      const startDate = '2025-06-01T00:00:00Z';
      const endDate = '2025-06-30T23:59:59Z';
      const granularity = 'week';
      
      const response = await request(app)
        .get(`/api/v1/analytics/${validUrlId}`)
        .query({ startDate, endDate, granularity });
      
      expect(response.status).toBe(200);
      expect(ClickEventEntity.getAnalytics).toHaveBeenCalledWith(
        validUrlId,
        expect.objectContaining({
          startDate,
          endDate,
          granularity
        })
      );
    });
  });
  
  describe('GET /api/v1/analytics/:urlId/geo', () => {
    const mockGeoData = [
      { country: 'Brazil', clicks: 50, percentage: 50 },
      { country: 'United States', clicks: 30, percentage: 30 }
    ];
    
    it('should return geographic distribution data', async () => {
      // Mock the getClicksByCountry method
      (ClickEventEntity.getClicksByCountry as jest.Mock).mockResolvedValue(mockGeoData);
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}/geo`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.countries).toEqual(mockGeoData);
      expect(ClickEventEntity.getClicksByCountry).toHaveBeenCalledWith(validUrlId);
    });
    
    it('should return 400 for an invalid URL ID', async () => {
      const invalidUrlId = 'invalid-uuid';
      
      const response = await request(app).get(`/api/v1/analytics/${invalidUrlId}/geo`);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_URL_ID');
    });
  });
  
  describe('GET /api/v1/analytics/:urlId/devices', () => {
    const mockDeviceData = [
      { deviceType: 'desktop', clicks: 60, percentage: 60 },
      { deviceType: 'mobile', clicks: 40, percentage: 40 }
    ];
    
    const mockBrowserData = [
      { browser: 'Chrome', clicks: 70, percentage: 70 },
      { browser: 'Firefox', clicks: 30, percentage: 30 }
    ];
    
    it('should return device and browser breakdown data', async () => {
      // Mock the methods
      (ClickEventEntity.getClicksByDevice as jest.Mock).mockResolvedValue(mockDeviceData);
      (ClickEventEntity.getClicksByBrowser as jest.Mock).mockResolvedValue(mockBrowserData);
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}/devices`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.devices).toEqual(mockDeviceData);
      expect(response.body.data.browsers).toEqual(mockBrowserData);
      expect(ClickEventEntity.getClicksByDevice).toHaveBeenCalledWith(validUrlId);
      expect(ClickEventEntity.getClicksByBrowser).toHaveBeenCalledWith(validUrlId);
    });
  });
  
  describe('GET /api/v1/analytics/:urlId/timeseries', () => {
    const mockTimeSeriesData = [
      { date: '2025-07-01', clicks: 10, uniqueVisitors: 5 },
      { date: '2025-07-02', clicks: 20, uniqueVisitors: 10 }
    ];
    
    it('should return time series data', async () => {
      // Mock the getClicksByDateRange method
      (ClickEventEntity.getClicksByDateRange as jest.Mock).mockResolvedValue(mockTimeSeriesData);
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}/timeseries`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.timeSeries).toEqual(mockTimeSeriesData);
      expect(response.body.meta).toBeDefined();
      expect(ClickEventEntity.getClicksByDateRange).toHaveBeenCalledWith(
        validUrlId,
        expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String),
          granularity: 'day'
        })
      );
    });
    
    it('should accept custom time range parameters', async () => {
      // Mock the getClicksByDateRange method
      (ClickEventEntity.getClicksByDateRange as jest.Mock).mockResolvedValue(mockTimeSeriesData);
      
      const startDate = '2025-06-01T00:00:00Z';
      const endDate = '2025-06-30T23:59:59Z';
      const granularity = 'hour';
      
      const response = await request(app)
        .get(`/api/v1/analytics/${validUrlId}/timeseries`)
        .query({ startDate, endDate, granularity });
      
      expect(response.status).toBe(200);
      expect(ClickEventEntity.getClicksByDateRange).toHaveBeenCalledWith(
        validUrlId,
        expect.objectContaining({
          startDate,
          endDate,
          granularity
        })
      );
    });
  });
  
  describe('GET /api/v1/analytics/:urlId/referrers', () => {
    const mockReferrerData = [
      { referrer: 'google.com', clicks: 40, percentage: 40 },
      { referrer: 'facebook.com', clicks: 30, percentage: 30 }
    ];
    
    it('should return referrer data', async () => {
      // Mock the getTopReferrers method
      (ClickEventEntity.getTopReferrers as jest.Mock).mockResolvedValue(mockReferrerData);
      
      const response = await request(app).get(`/api/v1/analytics/${validUrlId}/referrers`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.referrers).toEqual(mockReferrerData);
      expect(ClickEventEntity.getTopReferrers).toHaveBeenCalledWith(validUrlId);
    });
  });
});
import { Request, Response } from 'express';
import { z } from 'zod';
import { ClickEventEntity } from '@url-shortener/shared-db';
import { AnalyticsTimeRangeSchema } from '@url-shortener/shared-types';
import { databaseQueryDuration } from '@url-shortener/shared-monitoring';

// Default time range if not specified
const DEFAULT_TIME_RANGE = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
  endDate: new Date().toISOString(),
  granularity: 'day' as const
};

// Validate URL ID
const urlIdSchema = z.string().uuid();

/**
 * Get analytics for a specific URL
 */
export async function getUrlAnalytics(req: Request, res: Response): Promise<void> {
  const timer = databaseQueryDuration.startTimer({ operation: 'getUrlAnalytics' });
  
  try {
    // Validate URL ID
    const urlId = req.params.urlId;
    const urlIdResult = urlIdSchema.safeParse(urlId);
    
    if (!urlIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_URL_ID',
          message: 'Invalid URL ID format',
          details: urlIdResult.error.format()
        }
      });
      return;
    }
    
    // Parse time range from query parameters
    const timeRange = parseTimeRange(req);
    
    // Get analytics data
    const analytics = await ClickEventEntity.getAnalytics(urlId, timeRange);
    
    res.json({
      data: analytics,
      meta: {
        timeRange
      }
    });
  } catch (error) {
    console.error('Error getting URL analytics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve analytics data',
        details: process.env.NODE_ENV !== 'production' ? (error as Error).message : undefined
      }
    });
  } finally {
    timer();
  }
}

/**
 * Get geographic distribution for a URL
 */
export async function getGeographicDistribution(req: Request, res: Response): Promise<void> {
  const timer = databaseQueryDuration.startTimer({ operation: 'getGeographicDistribution' });
  
  try {
    // Validate URL ID
    const urlId = req.params.urlId;
    const urlIdResult = urlIdSchema.safeParse(urlId);
    
    if (!urlIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_URL_ID',
          message: 'Invalid URL ID format',
          details: urlIdResult.error.format()
        }
      });
      return;
    }
    
    // Get country distribution
    const countryData = await ClickEventEntity.getClicksByCountry(urlId);
    
    res.json({
      data: {
        countries: countryData
      }
    });
  } catch (error) {
    console.error('Error getting geographic distribution:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve geographic distribution data',
        details: process.env.NODE_ENV !== 'production' ? (error as Error).message : undefined
      }
    });
  } finally {
    timer();
  }
}

/**
 * Get device breakdown for a URL
 */
export async function getDeviceBreakdown(req: Request, res: Response): Promise<void> {
  const timer = databaseQueryDuration.startTimer({ operation: 'getDeviceBreakdown' });
  
  try {
    // Validate URL ID
    const urlId = req.params.urlId;
    const urlIdResult = urlIdSchema.safeParse(urlId);
    
    if (!urlIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_URL_ID',
          message: 'Invalid URL ID format',
          details: urlIdResult.error.format()
        }
      });
      return;
    }
    
    // Get device and browser data
    const [deviceData, browserData] = await Promise.all([
      ClickEventEntity.getClicksByDevice(urlId),
      ClickEventEntity.getClicksByBrowser(urlId)
    ]);
    
    res.json({
      data: {
        devices: deviceData,
        browsers: browserData
      }
    });
  } catch (error) {
    console.error('Error getting device breakdown:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve device breakdown data',
        details: process.env.NODE_ENV !== 'production' ? (error as Error).message : undefined
      }
    });
  } finally {
    timer();
  }
}

/**
 * Get time series data for a URL
 */
export async function getTimeSeriesData(req: Request, res: Response): Promise<void> {
  const timer = databaseQueryDuration.startTimer({ operation: 'getTimeSeriesData' });
  
  try {
    // Validate URL ID
    const urlId = req.params.urlId;
    const urlIdResult = urlIdSchema.safeParse(urlId);
    
    if (!urlIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_URL_ID',
          message: 'Invalid URL ID format',
          details: urlIdResult.error.format()
        }
      });
      return;
    }
    
    // Parse time range from query parameters
    const timeRange = parseTimeRange(req);
    
    // Get time series data
    const timeSeriesData = await ClickEventEntity.getClicksByDateRange(urlId, timeRange);
    
    res.json({
      data: {
        timeSeries: timeSeriesData
      },
      meta: {
        timeRange
      }
    });
  } catch (error) {
    console.error('Error getting time series data:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve time series data',
        details: process.env.NODE_ENV !== 'production' ? (error as Error).message : undefined
      }
    });
  } finally {
    timer();
  }
}

/**
 * Get referrer data for a URL
 */
export async function getReferrerData(req: Request, res: Response): Promise<void> {
  const timer = databaseQueryDuration.startTimer({ operation: 'getReferrerData' });
  
  try {
    // Validate URL ID
    const urlId = req.params.urlId;
    const urlIdResult = urlIdSchema.safeParse(urlId);
    
    if (!urlIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_URL_ID',
          message: 'Invalid URL ID format',
          details: urlIdResult.error.format()
        }
      });
      return;
    }
    
    // Get referrer data
    const referrerData = await ClickEventEntity.getTopReferrers(urlId);
    
    res.json({
      data: {
        referrers: referrerData
      }
    });
  } catch (error) {
    console.error('Error getting referrer data:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve referrer data',
        details: process.env.NODE_ENV !== 'production' ? (error as Error).message : undefined
      }
    });
  } finally {
    timer();
  }
}

/**
 * Parse time range from request query parameters
 */
function parseTimeRange(req: Request) {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    const timeRangeInput = {
      startDate: startDate ? String(startDate) : DEFAULT_TIME_RANGE.startDate,
      endDate: endDate ? String(endDate) : DEFAULT_TIME_RANGE.endDate,
      granularity: granularity ? String(granularity) : DEFAULT_TIME_RANGE.granularity
    };
    
    const timeRangeResult = AnalyticsTimeRangeSchema.safeParse(timeRangeInput);
    
    if (!timeRangeResult.success) {
      return DEFAULT_TIME_RANGE;
    }
    
    return timeRangeResult.data;
  } catch (error) {
    return DEFAULT_TIME_RANGE;
  }
}
import { executeClickHouseQuery, batchInsertClickHouseData } from '../clickhouse';
import { ClickEvent, AnalyticsTimeRange } from '@url-shortener/shared-types';

/**
 * ClickEvent entity class for database operations
 */
export class ClickEventEntity implements ClickEvent {
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

  constructor(data: Partial<ClickEventEntity>) {
    this.shortUrlId = data.shortUrlId || '';
    this.timestamp = data.timestamp || new Date();
    this.ipAddress = data.ipAddress || '';
    this.userAgent = data.userAgent || '';
    this.referrer = data.referrer;
    this.country = data.country;
    this.city = data.city;
    this.deviceType = data.deviceType || 'unknown';
    this.browser = data.browser || 'unknown';
    this.os = data.os || 'unknown';
  }

  /**
   * Insert a click event
   */
  static async insert(event: ClickEvent): Promise<void> {
    await batchInsertClickHouseData('click_events', [event]);
  }

  /**
   * Batch insert multiple click events
   */
  static async batchInsert(events: ClickEvent[]): Promise<void> {
    await batchInsertClickHouseData('click_events', events);
  }

  /**
   * Get total clicks for a short URL
   */
  static async getTotalClicks(shortUrlId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM click_events
      WHERE short_url_id = {shortUrlId:String}
    `;
    
    const result = await executeClickHouseQuery<{ total: number }>(query, { shortUrlId });
    
    return result[0]?.total || 0;
  }

  /**
   * Get unique visitors for a short URL
   */
  static async getUniqueVisitors(shortUrlId: string): Promise<number> {
    const query = `
      SELECT uniq(ip_address) as unique_visitors
      FROM click_events
      WHERE short_url_id = {shortUrlId:String}
    `;
    
    const result = await executeClickHouseQuery<{ unique_visitors: number }>(query, { shortUrlId });
    
    return result[0]?.unique_visitors || 0;
  }

  /**
   * Get clicks by date range
   */
  static async getClicksByDateRange(
    shortUrlId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Array<{ date: string; clicks: number; uniqueVisitors: number }>> {
    let intervalFunction: string;
    
    switch (timeRange.granularity) {
      case 'hour':
        intervalFunction = 'toStartOfHour';
        break;
      case 'week':
        intervalFunction = 'toStartOfWeek';
        break;
      case 'month':
        intervalFunction = 'toStartOfMonth';
        break;
      case 'day':
      default:
        intervalFunction = 'toDate';
    }
    
    const query = `
      SELECT
        toString(${intervalFunction}(timestamp)) as date,
        count() as clicks,
        uniq(ip_address) as unique_visitors
      FROM click_events
      WHERE 
        short_url_id = {shortUrlId:String}
        AND timestamp >= {startDate:String}
        AND timestamp <= {endDate:String}
      GROUP BY date
      ORDER BY date
    `;
    
    const result = await executeClickHouseQuery<{
      date: string;
      clicks: number;
      unique_visitors: number;
    }>(query, {
      shortUrlId,
      startDate: timeRange.startDate,
      endDate: timeRange.endDate
    });
    
    return result.map(row => ({
      date: row.date,
      clicks: row.clicks,
      uniqueVisitors: row.unique_visitors
    }));
  }

  /**
   * Get clicks by country
   */
  static async getClicksByCountry(shortUrlId: string): Promise<Array<{
    country: string;
    clicks: number;
    percentage: number;
  }>> {
    const query = `
      WITH total AS (
        SELECT count() as total_clicks
        FROM click_events
        WHERE short_url_id = {shortUrlId:String}
      )
      SELECT
        country,
        count() as clicks,
        round(count() * 100 / max(total_clicks), 2) as percentage
      FROM click_events, total
      WHERE 
        short_url_id = {shortUrlId:String}
        AND country != ''
      GROUP BY country
      ORDER BY clicks DESC
      LIMIT 10
    `;
    
    const result = await executeClickHouseQuery<{
      country: string;
      clicks: number;
      percentage: number;
    }>(query, { shortUrlId });
    
    return result;
  }

  /**
   * Get clicks by device type
   */
  static async getClicksByDevice(shortUrlId: string): Promise<Array<{
    deviceType: string;
    clicks: number;
    percentage: number;
  }>> {
    const query = `
      WITH total AS (
        SELECT count() as total_clicks
        FROM click_events
        WHERE short_url_id = {shortUrlId:String}
      )
      SELECT
        device_type,
        count() as clicks,
        round(count() * 100 / max(total_clicks), 2) as percentage
      FROM click_events, total
      WHERE 
        short_url_id = {shortUrlId:String}
        AND device_type != ''
      GROUP BY device_type
      ORDER BY clicks DESC
    `;
    
    const result = await executeClickHouseQuery<{
      device_type: string;
      clicks: number;
      percentage: number;
    }>(query, { shortUrlId });
    
    return result.map(row => ({
      deviceType: row.device_type,
      clicks: row.clicks,
      percentage: row.percentage
    }));
  }

  /**
   * Get clicks by browser
   */
  static async getClicksByBrowser(shortUrlId: string): Promise<Array<{
    browser: string;
    clicks: number;
    percentage: number;
  }>> {
    const query = `
      WITH total AS (
        SELECT count() as total_clicks
        FROM click_events
        WHERE short_url_id = {shortUrlId:String}
      )
      SELECT
        browser,
        count() as clicks,
        round(count() * 100 / max(total_clicks), 2) as percentage
      FROM click_events, total
      WHERE 
        short_url_id = {shortUrlId:String}
        AND browser != ''
      GROUP BY browser
      ORDER BY clicks DESC
      LIMIT 10
    `;
    
    const result = await executeClickHouseQuery<{
      browser: string;
      clicks: number;
      percentage: number;
    }>(query, { shortUrlId });
    
    return result;
  }

  /**
   * Get top referrers
   */
  static async getTopReferrers(shortUrlId: string): Promise<Array<{
    referrer: string;
    clicks: number;
    percentage: number;
  }>> {
    const query = `
      WITH total AS (
        SELECT count() as total_clicks
        FROM click_events
        WHERE short_url_id = {shortUrlId:String}
      )
      SELECT
        referrer,
        count() as clicks,
        round(count() * 100 / max(total_clicks), 2) as percentage
      FROM click_events, total
      WHERE 
        short_url_id = {shortUrlId:String}
        AND referrer != ''
      GROUP BY referrer
      ORDER BY clicks DESC
      LIMIT 10
    `;
    
    const result = await executeClickHouseQuery<{
      referrer: string;
      clicks: number;
      percentage: number;
    }>(query, { shortUrlId });
    
    return result;
  }

  /**
   * Get complete analytics data for a short URL
   */
  static async getAnalytics(
    shortUrlId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<{
    totalClicks: number;
    uniqueVisitors: number;
    clicksByDate: Array<{ date: string; clicks: number; uniqueVisitors: number }>;
    clicksByCountry: Array<{ country: string; clicks: number; percentage: number }>;
    clicksByDevice: Array<{ deviceType: string; clicks: number; percentage: number }>;
    clicksByBrowser: Array<{ browser: string; clicks: number; percentage: number }>;
    topReferrers: Array<{ referrer: string; clicks: number; percentage: number }>;
  }> {
    const [
      totalClicks,
      uniqueVisitors,
      clicksByDate,
      clicksByCountry,
      clicksByDevice,
      clicksByBrowser,
      topReferrers
    ] = await Promise.all([
      ClickEventEntity.getTotalClicks(shortUrlId),
      ClickEventEntity.getUniqueVisitors(shortUrlId),
      ClickEventEntity.getClicksByDateRange(shortUrlId, timeRange),
      ClickEventEntity.getClicksByCountry(shortUrlId),
      ClickEventEntity.getClicksByDevice(shortUrlId),
      ClickEventEntity.getClicksByBrowser(shortUrlId),
      ClickEventEntity.getTopReferrers(shortUrlId)
    ]);
    
    return {
      totalClicks,
      uniqueVisitors,
      clicksByDate,
      clicksByCountry,
      clicksByDevice,
      clicksByBrowser,
      topReferrers
    };
  }
}
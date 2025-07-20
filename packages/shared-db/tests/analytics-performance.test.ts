import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { ClickEventEntity } from '../src/models/ClickEvent';
import { getClickhouseClient, closeClickhouseClient } from '../src/clickhouse';

describe('Analytics Database Performance Tests', () => {
  beforeAll(async () => {
    // Ensure we have a connection to ClickHouse
    await getClickhouseClient();
  });
  
  afterAll(async () => {
    // Close the connection
    await closeClickhouseClient();
  });
  
  it('should efficiently query time series data', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // 30 days ago
    
    const endDate = new Date();
    const granularity = 'day';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getClicksByDateRange(
      urlId,
      { startDate, endDate, granularity }
    );
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Time series query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${result.length} data points`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(2000); // Less than 2 seconds
    expect(result).toBeDefined();
  });
  
  it('should efficiently query geographic distribution', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getClicksByCountry(urlId);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Geographic distribution query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${result.length} countries`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(1000); // Less than 1 second
    expect(result).toBeDefined();
  });
  
  it('should efficiently query device breakdown', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getClicksByDevice(urlId);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Device breakdown query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${result.length} device types`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(1000); // Less than 1 second
    expect(result).toBeDefined();
  });
  
  it('should efficiently query browser breakdown', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getClicksByBrowser(urlId);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Browser breakdown query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${result.length} browsers`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(1000); // Less than 1 second
    expect(result).toBeDefined();
  });
  
  it('should efficiently query referrer data', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getTopReferrers(urlId);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Referrer query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${result.length} referrers`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(1000); // Less than 1 second
    expect(result).toBeDefined();
  });
  
  it('should efficiently query analytics summary', async () => {
    // Setup test parameters
    const urlId = '123e4567-e89b-12d3-a456-426614174000';
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // 30 days ago
    
    const endDate = new Date();
    const granularity = 'day';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    const result = await ClickEventEntity.getAnalytics(
      urlId,
      { startDate, endDate, granularity }
    );
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Analytics summary query duration: ${duration.toFixed(2)}ms`);
    
    // Verify performance meets requirements
    expect(duration).toBeLessThan(2000); // Less than 2 seconds
    expect(result).toBeDefined();
    expect(result.totalClicks).toBeDefined();
    expect(result.uniqueVisitors).toBeDefined();
  });
  
  it('should handle high-volume data efficiently', async () => {
    // This test simulates querying a high-volume URL with millions of clicks
    // In a real test, we would use a URL with actual high-volume data
    
    // Setup test parameters
    const urlId = 'high-volume-test-url';
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 365); // 1 year ago
    
    const endDate = new Date();
    const granularity = 'month';
    
    // Execute query with performance measurement
    const startTime = performance.now();
    
    // Use a raw query to simulate high-volume data
    const client = await getClickhouseClient();
    
    const query = `
      SELECT
        toStartOfMonth(timestamp) as date,
        count() as clicks,
        uniqExact(ip_address) as unique_visitors
      FROM click_events
      WHERE short_url_id = {urlId:String}
        AND timestamp BETWEEN {startDate:DateTime} AND {endDate:DateTime}
      GROUP BY date
      ORDER BY date
    `;
    
    const result = await client.query({
      query,
      query_params: {
        urlId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
    
    const data = await result.json();
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`High-volume query duration: ${duration.toFixed(2)}ms`);
    console.log(`Returned ${data.length} data points`);
    
    // Verify performance meets requirements for high-volume data
    expect(duration).toBeLessThan(5000); // Less than 5 seconds for high-volume data
  });
});
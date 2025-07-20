import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClickEventProcessor } from '../services/clickEventProcessor';
import fs from 'fs/promises';
import path from 'path';

// Define the ClickEvent type locally to avoid dependency issues
interface ClickEvent {
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

// Mock dependencies
vi.mock('@url-shortener/shared-db', () => ({
  ClickEventEntity: {
    batchInsert: vi.fn().mockResolvedValue(undefined),
  }
}), { virtual: true });

vi.mock('@url-shortener/shared-monitoring', () => ({
  clickEventsProcessed: {
    inc: vi.fn()
  }
}), { virtual: true });

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn().mockResolvedValue(Buffer.from('mock-data')),
  mkdir: vi.fn()
}));

// Mock MaxMind Reader
vi.mock('maxmind', () => ({
  Reader: class MockReader {
    constructor() {}
    get(ip: string) {
      if (ip === '192.168.1.1') {
        return {
          country: { names: { en: 'United States' } },
          city: { names: { en: 'New York' } }
        };
      }
      return null;
    }
  }
}));

describe('ClickEventProcessor', () => {
  let processor: ClickEventProcessor;
  let mockClickEvent: ClickEvent;
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a new processor instance for each test
    processor = new ClickEventProcessor();
    
    // Mock successful file access
    vi.mocked(fs.access).mockResolvedValue(undefined);
    
    // Create a mock click event
    mockClickEvent = {
      shortUrlId: 'abc123',
      timestamp: new Date(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      referrer: 'https://example.com',
      deviceType: '',
      browser: '',
      os: ''
    };
  });
  
  afterEach(() => {
    // Clear any timers
    vi.restoreAllMocks();
  });
  
  it('should initialize successfully', async () => {
    await processor.initialize();
    expect(fs.access).toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalled();
  });
  
  it('should handle initialization when GeoIP database is missing', async () => {
    // Mock file not found
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));
    
    await processor.initialize();
    
    // Should not try to read the file
    expect(fs.readFile).not.toHaveBeenCalled();
  });
  
  it('should process a click event with user agent parsing', async () => {
    await processor.initialize();
    await processor.processEvent(mockClickEvent);
    
    // Force batch processing by calling private method
    // @ts-ignore - Accessing private method for testing
    await processor.processBatch();
    
    // Check that the event was enriched and inserted
    expect(ClickEventEntity.batchInsert).toHaveBeenCalledTimes(1);
    
    // Get the first argument of the first call
    const insertedEvents = vi.mocked(ClickEventEntity.batchInsert).mock.calls[0][0];
    
    // Check that the event was enriched with device info
    expect(insertedEvents[0].deviceType).toBe('desktop');
    expect(insertedEvents[0].browser).toBe('Chrome');
    expect(insertedEvents[0].os).toBe('Windows');
  });
  
  it('should enrich events with geolocation data', async () => {
    await processor.initialize();
    await processor.processEvent(mockClickEvent);
    
    // Force batch processing
    // @ts-ignore - Accessing private method for testing
    await processor.processBatch();
    
    // Get the inserted event
    const insertedEvents = vi.mocked(ClickEventEntity.batchInsert).mock.calls[0][0];
    
    // Check geolocation data
    expect(insertedEvents[0].country).toBe('United States');
    expect(insertedEvents[0].city).toBe('New York');
  });
  
  it('should handle invalid user agent gracefully', async () => {
    await processor.initialize();
    
    // Create event with invalid user agent
    const invalidEvent = {
      ...mockClickEvent,
      userAgent: 'invalid-user-agent'
    };
    
    await processor.processEvent(invalidEvent);
    
    // Force batch processing
    // @ts-ignore - Accessing private method for testing
    await processor.processBatch();
    
    // Get the inserted event
    const insertedEvents = vi.mocked(ClickEventEntity.batchInsert).mock.calls[0][0];
    
    // Should use default values
    expect(insertedEvents[0].deviceType).toBe('unknown');
    expect(insertedEvents[0].browser).toBe('unknown');
    expect(insertedEvents[0].os).toBe('unknown');
  });
  
  it('should batch process events when threshold is reached', async () => {
    await processor.initialize();
    
    // Set batch size to a small number for testing
    // @ts-ignore - Modifying private property for testing
    processor.BATCH_SIZE = 2;
    
    // Process two events to trigger batch processing
    await processor.processEvent(mockClickEvent);
    await processor.processEvent({
      ...mockClickEvent,
      shortUrlId: 'def456'
    });
    
    // Should have called batch insert
    expect(ClickEventEntity.batchInsert).toHaveBeenCalledTimes(1);
    
    // Check that both events were inserted
    const insertedEvents = vi.mocked(ClickEventEntity.batchInsert).mock.calls[0][0];
    expect(insertedEvents.length).toBe(2);
    expect(insertedEvents[0].shortUrlId).toBe('abc123');
    expect(insertedEvents[1].shortUrlId).toBe('def456');
  });
  
  it('should handle database errors during batch processing', async () => {
    await processor.initialize();
    
    // Mock database error
    vi.mocked(ClickEventEntity.batchInsert).mockRejectedValueOnce(new Error('Database error'));
    
    await processor.processEvent(mockClickEvent);
    
    // Force batch processing
    // @ts-ignore - Accessing private method for testing
    await processor.processBatch();
    
    // Should retry on next batch
    await processor.processEvent({
      ...mockClickEvent,
      shortUrlId: 'def456'
    });
    
    // Force batch processing again
    // @ts-ignore - Accessing private method for testing
    await processor.processBatch();
    
    // Should have called batch insert twice (once for the error, once for the retry)
    expect(ClickEventEntity.batchInsert).toHaveBeenCalledTimes(2);
  });
  
  it('should flush remaining events on shutdown', async () => {
    await processor.initialize();
    await processor.processEvent(mockClickEvent);
    
    // Shutdown should process any remaining events
    await processor.shutdown();
    
    // Should have called batch insert
    expect(ClickEventEntity.batchInsert).toHaveBeenCalledTimes(1);
  });
});
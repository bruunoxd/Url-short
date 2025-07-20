import { ClickEvent } from '@url-shortener/shared-types';
import { ClickEventEntity } from '@url-shortener/shared-db';
import { clickEventsProcessed } from '@url-shortener/shared-monitoring';
import { Reader as GeoIPReader } from 'maxmind';
import UAParser from 'ua-parser-js';
import path from 'path';
import fs from 'fs/promises';

const SERVICE_NAME = 'analytics';
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 5000;

/**
 * Service for processing click events
 */
export class ClickEventProcessor {
  private geoIpReader: GeoIPReader | null = null;
  private eventBatch: ClickEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private uaParser = new UAParser();

  /**
   * Initialize the click event processor
   */
  async initialize(): Promise<void> {
    try {
      // Load GeoIP database
      await this.loadGeoIPDatabase();
      
      // Start batch processing timer
      this.startBatchProcessing();
      
      console.log('Click event processor initialized');
    } catch (error) {
      console.error('Failed to initialize click event processor:', error);
      throw error;
    }
  }

  /**
   * Load the GeoIP database
   */
  private async loadGeoIPDatabase(): Promise<void> {
    try {
      // Path to GeoIP database file
      const dbPath = process.env.GEOIP_DB_PATH || path.join(__dirname, '../../data/GeoLite2-City.mmdb');
      
      // Check if file exists
      try {
        await fs.access(dbPath);
      } catch (error) {
        console.warn(`GeoIP database not found at ${dbPath}. Geolocation will be disabled.`);
        return;
      }
      
      // Load database
      const buffer = await fs.readFile(dbPath);
      this.geoIpReader = new GeoIPReader(buffer);
      
      console.log('GeoIP database loaded successfully');
    } catch (error) {
      console.error('Failed to load GeoIP database:', error);
      // Continue without geolocation
    }
  }

  /**
   * Start batch processing timer
   */
  private startBatchProcessing(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    this.batchTimer = setInterval(() => {
      this.processBatch().catch(error => {
        console.error('Error processing batch:', error);
      });
    }, BATCH_INTERVAL_MS);
  }

  /**
   * Process a click event
   */
  async processEvent(event: ClickEvent): Promise<void> {
    try {
      // Enrich event with device and browser info
      const enrichedEvent = this.enrichEventWithUserAgentInfo(event);
      
      // Enrich event with geolocation info if available
      const fullyEnrichedEvent = await this.enrichEventWithGeolocation(enrichedEvent);
      
      // Add to batch
      this.eventBatch.push(fullyEnrichedEvent);
      
      // Process batch if it reaches the threshold
      if (this.eventBatch.length >= BATCH_SIZE) {
        await this.processBatch();
      }
      
      // Record success metric
      clickEventsProcessed.inc({ service: SERVICE_NAME, status: 'success' });
    } catch (error) {
      console.error('Error processing click event:', error);
      
      // Record error metric
      clickEventsProcessed.inc({ service: SERVICE_NAME, status: 'error' });
      
      // Rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Process the current batch of events
   */
  private async processBatch(): Promise<void> {
    // Skip if no events or already processing
    if (this.eventBatch.length === 0 || this.isProcessing) {
      return;
    }
    
    // Set processing flag
    this.isProcessing = true;
    
    try {
      // Get current batch and clear
      const batch = [...this.eventBatch];
      this.eventBatch = [];
      
      // Insert batch into ClickHouse
      await ClickEventEntity.batchInsert(batch);
      
      console.log(`Processed ${batch.length} click events`);
    } catch (error) {
      console.error('Error processing batch:', error);
      
      // Record error metrics
      clickEventsProcessed.inc({ 
        service: SERVICE_NAME, 
        status: 'error' 
      }, this.eventBatch.length);
      
      // Put events back in batch to retry
      // Only keep the last BATCH_SIZE events to prevent memory issues
      this.eventBatch = [...this.eventBatch, ...this.eventBatch].slice(-BATCH_SIZE);
    } finally {
      // Reset processing flag
      this.isProcessing = false;
    }
  }

  /**
   * Enrich event with user agent information
   */
  private enrichEventWithUserAgentInfo(event: ClickEvent): ClickEvent {
    try {
      // Parse user agent
      this.uaParser.setUA(event.userAgent);
      const result = this.uaParser.getResult();
      
      // Extract device type
      let deviceType = 'unknown';
      if (result.device.type) {
        deviceType = result.device.type;
      } else if (result.os.name?.toLowerCase().includes('android') || result.os.name?.toLowerCase().includes('ios')) {
        deviceType = 'mobile';
      } else {
        deviceType = 'desktop';
      }
      
      // Extract browser info
      const browser = result.browser.name || 'unknown';
      const os = result.os.name || 'unknown';
      
      // Return enriched event
      return {
        ...event,
        deviceType,
        browser,
        os
      };
    } catch (error) {
      console.error('Error parsing user agent:', error);
      
      // Return original event with default values
      return {
        ...event,
        deviceType: 'unknown',
        browser: 'unknown',
        os: 'unknown'
      };
    }
  }

  /**
   * Enrich event with geolocation information
   */
  private async enrichEventWithGeolocation(event: ClickEvent): Promise<ClickEvent> {
    try {
      // Skip if no GeoIP reader or invalid IP
      if (!this.geoIpReader || !event.ipAddress) {
        return event;
      }
      
      // Lookup IP
      const lookup = this.geoIpReader.get(event.ipAddress);
      
      // Extract location info
      const country = lookup?.country?.names?.en || '';
      const city = lookup?.city?.names?.en || '';
      
      // Return enriched event
      return {
        ...event,
        country,
        city
      };
    } catch (error) {
      console.error('Error looking up geolocation:', error);
      
      // Return original event
      return event;
    }
  }

  /**
   * Stop the processor and flush any remaining events
   */
  async shutdown(): Promise<void> {
    try {
      // Clear batch timer
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = null;
      }
      
      // Process any remaining events
      if (this.eventBatch.length > 0) {
        await this.processBatch();
      }
      
      console.log('Click event processor shut down');
    } catch (error) {
      console.error('Error shutting down click event processor:', error);
    }
  }
}

// Export singleton instance
export const clickEventProcessor = new ClickEventProcessor();
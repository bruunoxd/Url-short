import { ShortUrlEntity } from '@url-shortener/shared-db';
import { cacheService } from '../services/cacheService';

/**
 * Get popular URLs for cache warming
 * 
 * @param options - Options for fetching popular URLs
 * @returns Array of popular URLs with their keys, values, and popularity scores
 */
export async function getPopularUrls(options: {
  limit?: number;
  minClicks?: number;
  maxAgeHours?: number;
}): Promise<Array<{ key: string; value: any; popularity: number }>> {
  const limit = options.limit || 500;
  const minClicks = options.minClicks || 5;
  const maxAgeHours = options.maxAgeHours || 24;
  
  try {
    // Calculate the cutoff date for recent URLs
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);
    
    // Fetch popular URLs from the database
    const popularUrls = await ShortUrlEntity.findPopularUrls({
      limit,
      minClicks,
      since: cutoffDate,
      includeInactive: false
    });
    
    // Format for cache warming
    return popularUrls.map(url => ({
      key: `url:${url.shortCode}`,
      value: url,
      popularity: url.clickCount || 0
    }));
  } catch (error) {
    console.error('Error fetching popular URLs for cache warming:', error);
    return [];
  }
}

/**
 * Initialize cache warming schedule
 * 
 * @param intervalMinutes - Interval in minutes between cache warming runs
 * @returns Function to stop the scheduled warming
 */
export function initializeCacheWarming(intervalMinutes: number = 15): () => void {
  console.log(`Initializing cache warming schedule (every ${intervalMinutes} minutes)`);
  
  // Perform initial cache warming
  getPopularUrls({ limit: 1000, minClicks: 3 })
    .then(popularUrls => {
      console.log(`Initial cache warming with ${popularUrls.length} popular URLs`);
      return cacheService.warmCache(async () => popularUrls);
    })
    .catch(error => {
      console.error('Error during initial cache warming:', error);
    });
  
  // Schedule periodic cache warming
  return cacheService.scheduleWarmCache(
    () => getPopularUrls({ limit: 500, minClicks: 5 }),
    intervalMinutes
  );
}

/**
 * Invalidate cache for a URL when it's updated
 * 
 * @param shortCode - Short code of the URL
 */
export async function invalidateUrlCache(shortCode: string): Promise<void> {
  try {
    const invalidatedCount = await cacheService.invalidateUrlCache(shortCode);
    console.log(`Invalidated ${invalidatedCount} cache entries for URL ${shortCode}`);
  } catch (error) {
    console.error(`Error invalidating cache for URL ${shortCode}:`, error);
  }
}

/**
 * Invalidate all cache entries for a user
 * 
 * @param userId - User ID
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    const invalidatedCount = await cacheService.invalidateUserCache(userId);
    console.log(`Invalidated ${invalidatedCount} cache entries for user ${userId}`);
  } catch (error) {
    console.error(`Error invalidating cache for user ${userId}:`, error);
  }
}
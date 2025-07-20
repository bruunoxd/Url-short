import { ShortUrlEntity } from '@url-shortener/shared-db';
import { ShortUrl, CreateUrlRequest, UpdateUrlRequest } from '@url-shortener/shared-types';
import { generateUniqueShortCode, validateAndSanitizeUrl, formatShortUrl, isMaliciousUrl } from '../utils/urlUtils';
import { cacheService } from './cacheService';
import { invalidateUrlCache } from '../utils/cacheUtils';

// Default short code length
const DEFAULT_CODE_LENGTH = 7;

/**
 * URL Service for handling URL shortening and management
 */
export class UrlService {
  /**
   * Create a new short URL
   * 
   * @param userId - User ID creating the URL
   * @param createUrlData - URL creation data
   * @returns Created short URL
   */
  async createShortUrl(userId: string, createUrlData: CreateUrlRequest): Promise<ShortUrl> {
    try {
      // Validate and sanitize the URL
      const sanitizedUrl = validateAndSanitizeUrl(createUrlData.originalUrl);
      
      // Check for malicious URLs
      if (isMaliciousUrl(sanitizedUrl)) {
        throw new Error('URL has been flagged as potentially malicious');
      }
      
      // Check if the URL has already been shortened by this user
      const existingUrl = await ShortUrlEntity.findByOriginalUrl(sanitizedUrl, userId);
      if (existingUrl) {
        return {
          ...existingUrl,
          shortUrl: formatShortUrl(existingUrl.shortCode)
        };
      }
      
      // Generate a unique short code with collision detection
      const shortCode = await generateUniqueShortCode(
        sanitizedUrl, 
        userId,
        DEFAULT_CODE_LENGTH,
        async (code) => await ShortUrlEntity.isShortCodeAvailable(code)
      );
      
      // Create the short URL in the database
      const shortUrl = await ShortUrlEntity.create({
        userId,
        originalUrl: sanitizedUrl,
        shortCode,
        title: createUrlData.title,
        tags: createUrlData.tags,
        expiresAt: createUrlData.expiresAt ? new Date(createUrlData.expiresAt) : undefined
      });
      
      // Cache the URL for fast lookups
      await this.cacheShortUrl(shortUrl);
      
      // Return the created URL with the formatted short URL
      return {
        ...shortUrl,
        shortUrl: formatShortUrl(shortCode)
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create short URL: ${error.message}`);
      }
      throw new Error('Failed to create short URL');
    }
  }
  
  /**
   * Get a short URL by its short code
   * 
   * @param shortCode - Short code to look up
   * @returns Short URL or null if not found
   */
  async getShortUrl(shortCode: string): Promise<ShortUrl | null> {
    try {
      // Try to get from cache first (multi-level cache)
      const cacheKey = `url:${shortCode}`;
      const cachedUrl = await cacheService.get<ShortUrl>(cacheKey);
      
      if (cachedUrl) {
        return {
          ...cachedUrl,
          shortUrl: formatShortUrl(shortCode)
        };
      }
      
      // If not in cache, get from database
      const shortUrl = await ShortUrlEntity.findByShortCode(shortCode);
      
      if (!shortUrl) {
        return null;
      }
      
      // Cache the URL for future lookups
      await this.cacheShortUrl(shortUrl);
      
      // Return the URL with the formatted short URL
      return {
        ...shortUrl,
        shortUrl: formatShortUrl(shortCode)
      };
    } catch (error) {
      console.error('Error getting short URL:', error);
      return null;
    }
  }
  
  /**
   * Update a short URL
   * 
   * @param id - Short URL ID
   * @param userId - User ID (for authorization)
   * @param updateData - Update data
   * @returns Updated short URL
   */
  async updateShortUrl(id: string, userId: string, updateData: UpdateUrlRequest): Promise<ShortUrl> {
    try {
      // Get the short URL
      const shortUrl = await ShortUrlEntity.findById(id);
      
      if (!shortUrl) {
        throw new Error('Short URL not found');
      }
      
      // Check if the user owns the URL
      if (shortUrl.userId !== userId) {
        throw new Error('You do not have permission to update this URL');
      }
      
      // Store the original short code for cache invalidation
      const originalShortCode = shortUrl.shortCode;
      const wasActive = shortUrl.isActive;
      
      // Update the URL
      const updatedUrl = await shortUrl.update({
        title: updateData.title,
        tags: updateData.tags,
        isActive: updateData.isActive,
        expiresAt: updateData.expiresAt ? new Date(updateData.expiresAt) : undefined
      });
      
      // If URL activation status changed, handle cache differently
      if (wasActive !== updatedUrl.isActive) {
        if (updatedUrl.isActive) {
          // URL was reactivated - add to cache
          await this.cacheShortUrl(updatedUrl);
        } else {
          // URL was deactivated - remove from cache
          await invalidateUrlCache(originalShortCode);
        }
      } else if (updatedUrl.isActive) {
        // URL remains active - update cache
        await this.cacheShortUrl(updatedUrl);
      }
      
      // Return the updated URL with the formatted short URL
      return {
        ...updatedUrl,
        shortUrl: formatShortUrl(updatedUrl.shortCode)
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to update short URL: ${error.message}`);
      }
      throw new Error('Failed to update short URL');
    }
  }
  
  /**
   * Delete a short URL (soft delete)
   * 
   * @param id - Short URL ID
   * @param userId - User ID (for authorization)
   */
  async deleteShortUrl(id: string, userId: string): Promise<void> {
    try {
      // Get the short URL
      const shortUrl = await ShortUrlEntity.findById(id);
      
      if (!shortUrl) {
        throw new Error('Short URL not found');
      }
      
      // Check if the user owns the URL
      if (shortUrl.userId !== userId) {
        throw new Error('You do not have permission to delete this URL');
      }
      
      // Soft delete the URL
      await shortUrl.delete();
      
      // Remove from cache
      await cacheService.delete(`url:${shortUrl.shortCode}`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to delete short URL: ${error.message}`);
      }
      throw new Error('Failed to delete short URL');
    }
  }
  
  /**
   * List short URLs for a user
   * 
   * @param userId - User ID
   * @param options - Pagination and filtering options
   * @returns List of short URLs and total count
   */
  async listUserShortUrls(userId: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    searchTerm?: string;
    tagFilter?: string[];
    activeOnly?: boolean;
  }): Promise<{ urls: ShortUrl[]; total: number }> {
    try {
      const { urls, total } = await ShortUrlEntity.listByUser(userId, options);
      
      // Format the short URLs
      const formattedUrls = urls.map(url => ({
        ...url,
        shortUrl: formatShortUrl(url.shortCode)
      }));
      
      return { urls: formattedUrls, total };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list short URLs: ${error.message}`);
      }
      throw new Error('Failed to list short URLs');
    }
  }
  
  /**
   * Cache a short URL for fast lookups
   * 
   * @param shortUrl - Short URL to cache
   */
  private async cacheShortUrl(shortUrl: ShortUrlEntity): Promise<void> {
    try {
      const cacheKey = `url:${shortUrl.shortCode}`;
      
      // Only cache active URLs
      if (shortUrl.isActive) {
        await cacheService.set(cacheKey, shortUrl);
      } else {
        // If URL is inactive, remove from cache
        await cacheService.delete(cacheKey);
      }
    } catch (error) {
      console.error('Error caching short URL:', error);
      // Don't throw - caching errors shouldn't break the main flow
    }
  }
}
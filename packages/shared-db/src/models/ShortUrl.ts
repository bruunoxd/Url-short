import { executeQuery, executeTransaction } from '../postgres';
import { ShortUrl, UrlStats } from '@url-shortener/shared-types';

/**
 * ShortUrl entity class for database operations
 */
export class ShortUrlEntity implements ShortUrl {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  title?: string;
  tags: string[];
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<ShortUrlEntity>) {
    this.id = data.id || '';
    this.userId = data.userId || '';
    this.originalUrl = data.originalUrl || '';
    this.shortCode = data.shortCode || '';
    this.title = data.title;
    this.tags = data.tags || [];
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.expiresAt = data.expiresAt;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new short URL
   */
  static async create(urlData: {
    userId: string;
    originalUrl: string;
    shortCode: string;
    title?: string;
    tags?: string[];
    expiresAt?: Date;
  }): Promise<ShortUrlEntity> {
    const query = `
      INSERT INTO short_urls (
        user_id, original_url, short_code, title, tags, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await executeQuery<ShortUrlEntity>(
      query,
      [
        urlData.userId,
        urlData.originalUrl,
        urlData.shortCode,
        urlData.title || null,
        urlData.tags || [],
        urlData.expiresAt || null
      ]
    );
    
    if (result.length === 0) {
      throw new Error('Failed to create short URL');
    }
    
    return ShortUrlEntity.fromDb(result[0]);
  }

  /**
   * Find short URL by ID
   */
  static async findById(id: string): Promise<ShortUrlEntity | null> {
    const query = `
      SELECT * FROM short_urls
      WHERE id = $1
    `;
    
    const result = await executeQuery<ShortUrlEntity>(query, [id]);
    
    if (result.length === 0) {
      return null;
    }
    
    return ShortUrlEntity.fromDb(result[0]);
  }

  /**
   * Find short URL by short code
   */
  static async findByShortCode(shortCode: string): Promise<ShortUrlEntity | null> {
    const query = `
      SELECT * FROM short_urls
      WHERE short_code = $1
    `;
    
    const result = await executeQuery<ShortUrlEntity>(query, [shortCode]);
    
    if (result.length === 0) {
      return null;
    }
    
    return ShortUrlEntity.fromDb(result[0]);
  }

  /**
   * Find existing short URL by original URL and user ID
   */
  static async findByOriginalUrl(originalUrl: string, userId: string): Promise<ShortUrlEntity | null> {
    const query = `
      SELECT * FROM short_urls
      WHERE original_url = $1 AND user_id = $2
      LIMIT 1
    `;
    
    const result = await executeQuery<ShortUrlEntity>(query, [originalUrl, userId]);
    
    if (result.length === 0) {
      return null;
    }
    
    return ShortUrlEntity.fromDb(result[0]);
  }

  /**
   * Update short URL
   */
  async update(updates: {
    title?: string;
    tags?: string[];
    isActive?: boolean;
    expiresAt?: Date | null;
  }): Promise<ShortUrlEntity> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    
    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }
    
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updates.isActive);
    }
    
    if (updates.expiresAt !== undefined) {
      fields.push(`expires_at = $${paramIndex++}`);
      values.push(updates.expiresAt);
    }
    
    if (fields.length === 0) {
      return this;
    }
    
    values.push(this.id);
    
    const query = `
      UPDATE short_urls
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await executeQuery<ShortUrlEntity>(query, values);
    
    if (result.length === 0) {
      throw new Error('Failed to update short URL');
    }
    
    const updatedUrl = ShortUrlEntity.fromDb(result[0]);
    
    // Update current instance
    Object.assign(this, updatedUrl);
    
    return this;
  }

  /**
   * Delete short URL (soft delete by setting isActive to false)
   */
  async delete(): Promise<void> {
    await this.update({ isActive: false });
  }

  /**
   * Hard delete short URL from database
   */
  async hardDelete(): Promise<void> {
    const query = `
      DELETE FROM short_urls
      WHERE id = $1
    `;
    
    await executeQuery(query, [this.id]);
  }

  /**
   * List short URLs for a user with pagination
   */
  static async listByUser(userId: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    searchTerm?: string;
    tagFilter?: string[];
    activeOnly?: boolean;
  }): Promise<{ urls: ShortUrlEntity[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';
    const activeOnly = options.activeOnly !== undefined ? options.activeOnly : true;
    
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['created_at', 'title', 'original_url', 'updated_at'];
    const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    
    // Build WHERE clause
    let whereClause = 'user_id = $1';
    const queryParams: any[] = [userId];
    let paramIndex = 2;
    
    if (activeOnly) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      queryParams.push(true);
    }
    
    if (options.searchTerm) {
      whereClause += ` AND (
        title ILIKE $${paramIndex} OR
        original_url ILIKE $${paramIndex} OR
        short_code ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${options.searchTerm}%`);
      paramIndex++;
    }
    
    if (options.tagFilter && options.tagFilter.length > 0) {
      whereClause += ` AND tags && $${paramIndex++}`;
      queryParams.push(options.tagFilter);
    }
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM short_urls
      WHERE ${whereClause}
    `;
    
    const listQuery = `
      SELECT *
      FROM short_urls
      WHERE ${whereClause}
      ORDER BY ${safeSort} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    
    queryParams.push(limit, offset);
    
    const [countResult, listResult] = await Promise.all([
      executeQuery<{ total: string }>(countQuery, queryParams.slice(0, -2)),
      executeQuery<ShortUrlEntity>(listQuery, queryParams)
    ]);
    
    const total = parseInt(countResult[0].total, 10);
    const urls = listResult.map(url => ShortUrlEntity.fromDb(url));
    
    return { urls, total };
  }

  /**
   * Get popular short URLs
   */
  static async getPopular(limit: number = 10): Promise<ShortUrlEntity[]> {
    // In a real implementation, this would join with analytics data
    // For now, we'll just return the most recently created URLs
    const query = `
      SELECT *
      FROM short_urls
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const result = await executeQuery<ShortUrlEntity>(query, [limit]);
    
    return result.map(url => ShortUrlEntity.fromDb(url));
  }

  /**
   * Check if a short code is already in use
   */
  static async isShortCodeAvailable(shortCode: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM short_urls
      WHERE short_code = $1
    `;
    
    const result = await executeQuery<{ count: string }>(query, [shortCode]);
    
    return parseInt(result[0].count, 10) === 0;
  }

  /**
   * Convert database row to ShortUrlEntity
   */
  static fromDb(row: any): ShortUrlEntity {
    return new ShortUrlEntity({
      id: row.id,
      userId: row.user_id,
      originalUrl: row.original_url,
      shortCode: row.short_code,
      title: row.title,
      tags: row.tags || [],
      isActive: row.is_active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
}
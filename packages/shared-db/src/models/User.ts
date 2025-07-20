import { executeQuery } from '../postgres';
import { User } from '@url-shortener/shared-types';

/**
 * User entity class for database operations
 */
export class UserEntity implements User {
  id: string;
  email: string;
  name?: string;
  passwordHash: string; // Not exposed in the User interface
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  emailVerified: boolean;

  constructor(data: Partial<UserEntity>) {
    this.id = data.id || '';
    this.email = data.email || '';
    this.name = data.name;
    this.passwordHash = data.passwordHash || '';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.emailVerified = data.emailVerified !== undefined ? data.emailVerified : false;
  }

  /**
   * Create a new user
   */
  static async create(userData: {
    email: string;
    passwordHash: string;
    name?: string;
  }): Promise<UserEntity> {
    const query = `
      INSERT INTO users (email, password_hash, name)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await executeQuery<UserEntity>(
      query,
      [userData.email, userData.passwordHash, userData.name || null]
    );
    
    if (result.length === 0) {
      throw new Error('Failed to create user');
    }
    
    return UserEntity.fromDb(result[0]);
  }

  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<UserEntity | null> {
    const query = `
      SELECT * FROM users
      WHERE id = $1
    `;
    
    const result = await executeQuery<UserEntity>(query, [id]);
    
    if (result.length === 0) {
      return null;
    }
    
    return UserEntity.fromDb(result[0]);
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<UserEntity | null> {
    const query = `
      SELECT * FROM users
      WHERE email = $1
    `;
    
    const result = await executeQuery<UserEntity>(query, [email]);
    
    if (result.length === 0) {
      return null;
    }
    
    return UserEntity.fromDb(result[0]);
  }

  /**
   * Update user
   */
  async update(updates: {
    name?: string;
    email?: string;
    passwordHash?: string;
    isActive?: boolean;
    emailVerified?: boolean;
  }): Promise<UserEntity> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    
    if (updates.passwordHash !== undefined) {
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(updates.passwordHash);
    }
    
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updates.isActive);
    }
    
    if (updates.emailVerified !== undefined) {
      fields.push(`email_verified = $${paramIndex++}`);
      values.push(updates.emailVerified);
    }
    
    if (fields.length === 0) {
      return this;
    }
    
    values.push(this.id);
    
    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await executeQuery<UserEntity>(query, values);
    
    if (result.length === 0) {
      throw new Error('Failed to update user');
    }
    
    const updatedUser = UserEntity.fromDb(result[0]);
    
    // Update current instance
    Object.assign(this, updatedUser);
    
    return this;
  }

  /**
   * Delete user
   */
  async delete(): Promise<void> {
    const query = `
      DELETE FROM users
      WHERE id = $1
    `;
    
    await executeQuery(query, [this.id]);
  }

  /**
   * List users with pagination
   */
  static async list(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ users: UserEntity[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';
    
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['created_at', 'email', 'name', 'updated_at'];
    const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
    `;
    
    const listQuery = `
      SELECT *
      FROM users
      ORDER BY ${safeSort} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $1 OFFSET $2
    `;
    
    const [countResult, listResult] = await Promise.all([
      executeQuery<{ total: string }>(countQuery),
      executeQuery<UserEntity>(listQuery, [limit, offset])
    ]);
    
    const total = parseInt(countResult[0].total, 10);
    const users = listResult.map(user => UserEntity.fromDb(user));
    
    return { users, total };
  }

  /**
   * Convert database row to UserEntity
   */
  static fromDb(row: any): UserEntity {
    return new UserEntity({
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: row.is_active,
      emailVerified: row.email_verified
    });
  }

  /**
   * Convert to API-safe user object (without password hash)
   */
  toApiUser(): User {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      emailVerified: this.emailVerified
    };
  }
}
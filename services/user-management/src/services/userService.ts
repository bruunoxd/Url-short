import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserEntity } from '@url-shortener/shared-db';
import { UpdateUserRequest, DeleteAccountRequest } from '@url-shortener/shared-types';
import { getRedisClient } from '@url-shortener/shared-db';

// Environment variables with defaults for development
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';
const EMAIL_VERIFICATION_EXPIRES_IN = process.env.EMAIL_VERIFICATION_EXPIRES_IN || '24h';
const PASSWORD_RESET_EXPIRES_IN = process.env.PASSWORD_RESET_EXPIRES_IN || '1h';
const BCRYPT_COST_FACTOR = 12;

// Redis key prefixes
const EMAIL_VERIFICATION_PREFIX = 'email_verification:';
const PASSWORD_RESET_PREFIX = 'password_reset:';

export class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserEntity | null> {
    return UserEntity.findById(userId);
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updates: UpdateUserRequest): Promise<UserEntity> {
    // Get user
    const user = await UserEntity.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if email is being updated and if it's already in use
    if (updates.email && updates.email !== user.email) {
      const existingUser = await UserEntity.findByEmail(updates.email);
      if (existingUser) {
        throw new Error('Email already in use');
      }
    }

    // Update user
    return user.update(updates);
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    // Get user
    const user = await UserEntity.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user's email is already verified
    if (user.emailVerified) {
      throw new Error('Email already verified');
    }

    // Generate verification token
    const token = this.generateToken();
    
    // Store token in Redis with expiration
    const redis = await getRedisClient();
    await redis.set(
      `${EMAIL_VERIFICATION_PREFIX}${token}`,
      userId,
      'EX',
      this.getExpirationSeconds(EMAIL_VERIFICATION_EXPIRES_IN)
    );

    // In a real application, send an email with the verification link
    // For this implementation, we'll just log it
    console.log(`Verification link: https://example.com/verify-email?token=${token}`);
    
    // TODO: Implement actual email sending
    // await sendEmail({
    //   to: user.email,
    //   subject: 'Verify your email',
    //   text: `Click the link to verify your email: https://example.com/verify-email?token=${token}`,
    //   html: `<p>Click <a href="https://example.com/verify-email?token=${token}">here</a> to verify your email.</p>`
    // });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    // Get user ID from Redis
    const redis = await getRedisClient();
    const userId = await redis.get(`${EMAIL_VERIFICATION_PREFIX}${token}`);
    
    if (!userId) {
      throw new Error('Invalid or expired token');
    }

    // Get user
    const user = await UserEntity.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update user
    await user.update({ emailVerified: true });

    // Delete token from Redis
    await redis.del(`${EMAIL_VERIFICATION_PREFIX}${token}`);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    // Get user
    const user = await UserEntity.findByEmail(email);
    if (!user) {
      // Don't throw error to prevent email enumeration
      return;
    }

    // Generate reset token
    const token = this.generateToken();
    
    // Store token in Redis with expiration
    const redis = await getRedisClient();
    await redis.set(
      `${PASSWORD_RESET_PREFIX}${token}`,
      user.id,
      'EX',
      this.getExpirationSeconds(PASSWORD_RESET_EXPIRES_IN)
    );

    // In a real application, send an email with the reset link
    // For this implementation, we'll just log it
    console.log(`Password reset link: https://example.com/reset-password?token=${token}`);
    
    // TODO: Implement actual email sending
    // await sendEmail({
    //   to: user.email,
    //   subject: 'Reset your password',
    //   text: `Click the link to reset your password: https://example.com/reset-password?token=${token}`,
    //   html: `<p>Click <a href="https://example.com/reset-password?token=${token}">here</a> to reset your password.</p>`
    // });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Get user ID from Redis
    const redis = await getRedisClient();
    const userId = await redis.get(`${PASSWORD_RESET_PREFIX}${token}`);
    
    if (!userId) {
      throw new Error('Invalid or expired token');
    }

    // Get user
    const user = await UserEntity.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

    // Update user
    await user.update({ passwordHash });

    // Delete token from Redis
    await redis.del(`${PASSWORD_RESET_PREFIX}${token}`);
  }
  
  /**
   * Delete user account
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    // Get user
    const user = await UserEntity.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }
    
    // Delete user
    await user.delete();
    
    // Clean up any Redis keys associated with the user
    // This would include any active sessions, verification tokens, etc.
    const redis = await getRedisClient();
    const sessionKeys = await redis.keys(`session:*:${userId}`);
    if (sessionKeys.length > 0) {
      await redis.del(sessionKeys);
    }
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Convert JWT expiration time to seconds
   */
  private getExpirationSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([hmd])$/);
    if (!match) {
      return 24 * 60 * 60; // Default to 24 hours
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'h': return value * 60 * 60;
      case 'm': return value * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 24 * 60 * 60;
    }
  }
}

export default new UserService();
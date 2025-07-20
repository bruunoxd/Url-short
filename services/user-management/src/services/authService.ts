import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserEntity } from '@url-shortener/shared-db';
import { AuthTokens, JWTPayload, RegisterRequest, LoginRequest } from '@url-shortener/shared-types';

// Environment variables with defaults for development
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'development-refresh-secret-change-in-production';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const BCRYPT_COST_FACTOR = 12;

export class AuthService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserEntity | null> {
    return UserEntity.findById(userId);
  }

  /**
   * Register a new user
   */
  async register(userData: RegisterRequest): Promise<UserEntity> {
    // Check if user already exists
    const existingUser = await UserEntity.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_COST_FACTOR);

    // Create user
    const user = await UserEntity.create({
      email: userData.email,
      passwordHash,
      name: userData.name
    });

    return user;
  }

  /**
   * Login user and generate tokens
   */
  async login(credentials: LoginRequest): Promise<AuthTokens> {
    // Find user by email
    const user = await UserEntity.findByEmail(credentials.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens(user);
    return tokens;
  }

  /**
   * Generate access and refresh tokens
   */
  generateTokens(user: UserEntity): AuthTokens {
    // Create JWT payload
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      permissions: ['user'] // Basic permissions, can be extended later
    };

    // Generate access token
    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Calculate expiration in seconds
    const decodedToken = jwt.decode(accessToken) as { exp: number };
    const expiresIn = decodedToken.exp - Math.floor(Date.now() / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { userId: string };
      
      // Get user
      const user = await UserEntity.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new Error('Invalid token or user not found');
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }
}

export default new AuthService();
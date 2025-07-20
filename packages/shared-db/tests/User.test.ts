import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserEntity } from '../src/models/User';

// Mock the database functions
vi.mock('../src/postgres', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
  getPostgresPool: vi.fn(),
}));

import { executeQuery } from '../src/postgres';

describe('UserEntity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create a user entity with default values', () => {
      const user = new UserEntity({});
      
      expect(user.id).toBe('');
      expect(user.email).toBe('');
      expect(user.passwordHash).toBe('');
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a user entity with provided values', () => {
      const now = new Date();
      const user = new UserEntity({
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash123',
        isActive: false,
        createdAt: now,
        updatedAt: now,
      });
      
      expect(user.id).toBe('123');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.passwordHash).toBe('hash123');
      expect(user.isActive).toBe(false);
      expect(user.createdAt).toBe(now);
      expect(user.updatedAt).toBe(now);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hash123',
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
      };
      
      vi.mocked(executeQuery).mockResolvedValueOnce([mockUser]);
      
      const user = await UserEntity.create({
        email: 'test@example.com',
        passwordHash: 'hash123',
        name: 'Test User',
      });
      
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['test@example.com', 'hash123', 'Test User']
      );
      
      expect(user).toBeInstanceOf(UserEntity);
      expect(user.id).toBe('123');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
    });

    it('should throw an error if user creation fails', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([]);
      
      await expect(UserEntity.create({
        email: 'test@example.com',
        passwordHash: 'hash123',
      })).rejects.toThrow('Failed to create user');
    });
  });

  describe('findById', () => {
    it('should find a user by ID', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hash123',
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
      };
      
      vi.mocked(executeQuery).mockResolvedValueOnce([mockUser]);
      
      const user = await UserEntity.findById('123');
      
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users'),
        ['123']
      );
      
      expect(user).toBeInstanceOf(UserEntity);
      expect(user?.id).toBe('123');
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null if user is not found', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([]);
      
      const user = await UserEntity.findById('123');
      
      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hash123',
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
      };
      
      vi.mocked(executeQuery).mockResolvedValueOnce([mockUser]);
      
      const user = await UserEntity.findByEmail('test@example.com');
      
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users'),
        ['test@example.com']
      );
      
      expect(user).toBeInstanceOf(UserEntity);
      expect(user?.id).toBe('123');
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null if user is not found', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([]);
      
      const user = await UserEntity.findByEmail('test@example.com');
      
      expect(user).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user properties', async () => {
      const user = new UserEntity({
        id: '123',
        email: 'old@example.com',
        name: 'Old Name',
      });
      
      const mockUpdatedUser = {
        id: '123',
        email: 'new@example.com',
        name: 'New Name',
        password_hash: 'hash123',
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
      };
      
      vi.mocked(executeQuery).mockResolvedValueOnce([mockUpdatedUser]);
      
      await user.update({
        email: 'new@example.com',
        name: 'New Name',
      });
      
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining(['New Name', 'new@example.com', '123'])
      );
      
      expect(user.email).toBe('new@example.com');
      expect(user.name).toBe('New Name');
    });

    it('should return the same instance if no updates are provided', async () => {
      const user = new UserEntity({
        id: '123',
        email: 'test@example.com',
      });
      
      const result = await user.update({});
      
      expect(executeQuery).not.toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('should throw an error if update fails', async () => {
      const user = new UserEntity({
        id: '123',
        email: 'test@example.com',
      });
      
      vi.mocked(executeQuery).mockResolvedValueOnce([]);
      
      await expect(user.update({ name: 'New Name' })).rejects.toThrow('Failed to update user');
    });
  });

  describe('delete', () => {
    it('should delete a user', async () => {
      const user = new UserEntity({
        id: '123',
        email: 'test@example.com',
      });
      
      vi.mocked(executeQuery).mockResolvedValueOnce([]);
      
      await user.delete();
      
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users'),
        ['123']
      );
    });
  });

  describe('list', () => {
    it('should list users with pagination', async () => {
      const mockUsers = [
        {
          id: '123',
          email: 'test1@example.com',
          name: 'Test User 1',
          password_hash: 'hash123',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
        },
        {
          id: '456',
          email: 'test2@example.com',
          name: 'Test User 2',
          password_hash: 'hash456',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
        },
      ];
      
      const mockCount = [{ total: '2' }];
      
      vi.mocked(executeQuery).mockResolvedValueOnce(mockCount);
      vi.mocked(executeQuery).mockResolvedValueOnce(mockUsers);
      
      const result = await UserEntity.list({
        page: 1,
        limit: 10,
        sortBy: 'email',
        sortOrder: 'asc',
      });
      
      expect(executeQuery).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0]).toBeInstanceOf(UserEntity);
      expect(result.users[0].id).toBe('123');
      expect(result.users[1].id).toBe('456');
    });
  });

  describe('fromDb', () => {
    it('should convert database row to UserEntity', () => {
      const row = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hash123',
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
      };
      
      const user = UserEntity.fromDb(row);
      
      expect(user).toBeInstanceOf(UserEntity);
      expect(user.id).toBe('123');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.passwordHash).toBe('hash123');
      expect(user.isActive).toBe(true);
    });
  });

  describe('toApiUser', () => {
    it('should convert UserEntity to API-safe user object', () => {
      const user = new UserEntity({
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash123',
        isActive: true,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
      });
      
      const apiUser = user.toApiUser();
      
      expect(apiUser.id).toBe('123');
      expect(apiUser.email).toBe('test@example.com');
      expect(apiUser.name).toBe('Test User');
      expect(apiUser.isActive).toBe(true);
      expect(apiUser.createdAt).toEqual(new Date('2023-01-01'));
      expect(apiUser.updatedAt).toEqual(new Date('2023-01-02'));
      expect((apiUser as any).passwordHash).toBeUndefined();
    });
  });
});
import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { User, AuthState, LoginCredentials, RegisterData } from '@/types/auth';
import { toast } from 'react-toastify';

// This is a simplified auth hook for demonstration
// In a real application, you would use a more robust solution like NextAuth.js

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    // Check for token in localStorage on initial load
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const decoded = jwtDecode<{ userId: string; email: string }>(token);
        // In a real app, you would validate the token with the server
        setAuthState({
          user: {
            id: decoded.userId,
            email: decoded.email,
            name: null, // Would be fetched from server
            createdAt: new Date().toISOString(),
          },
          token,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        // Invalid token
        localStorage.removeItem('auth_token');
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      // In a real app, this would be an API call
      // Simulating API call for demonstration
      if (credentials.email && credentials.password) {
        // Mock successful login
        const mockToken = 'mock_jwt_token';
        localStorage.setItem('auth_token', mockToken);
        
        setAuthState({
          user: {
            id: '123',
            email: credentials.email,
            name: 'Test User',
            createdAt: new Date().toISOString(),
          },
          token: mockToken,
          isAuthenticated: true,
          isLoading: false,
        });
        
        toast.success('Login successful!');
        return true;
      }
      throw new Error('Invalid credentials');
    } catch (error) {
      toast.error('Login failed. Please check your credentials.');
      return false;
    }
  };

  const register = async (data: RegisterData) => {
    try {
      // In a real app, this would be an API call
      // Simulating API call for demonstration
      if (data.password !== data.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      // Mock successful registration
      toast.success('Registration successful! Please log in.');
      return true;
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Registration failed. Please try again.');
      }
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    toast.info('You have been logged out.');
  };

  const forgotPassword = async (email: string) => {
    try {
      // In a real app, this would be an API call
      // Simulating API call for demonstration
      toast.success('If your email exists in our system, you will receive a password reset link.');
      return true;
    } catch (error) {
      toast.error('Failed to process your request. Please try again.');
      return false;
    }
  };

  return {
    ...authState,
    login,
    register,
    logout,
    forgotPassword,
  };
}
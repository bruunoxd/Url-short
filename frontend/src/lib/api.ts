import { CreateUrlRequest, ShortUrlResponse, UpdateUrlRequest } from '@/types/url';
import { toast } from 'react-toastify';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to handle API errors
const handleApiError = (error: unknown) => {
  console.error('API Error:', error);
  if (error instanceof Error) {
    toast.error(error.message);
  } else {
    toast.error('An unexpected error occurred');
  }
  throw error;
};

// Helper function to make authenticated API requests
const fetchWithAuth = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  // Get token from localStorage
  const token = localStorage.getItem('auth_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error);
  }
};

// URL Management API
export const urlApi = {
  // Create a new short URL
  createUrl: async (data: CreateUrlRequest): Promise<ShortUrlResponse> => {
    return fetchWithAuth('/api/v1/urls', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get all URLs for the current user with pagination
  getUrls: async (page = 1, limit = 10, search?: string): Promise<{
    urls: ShortUrlResponse[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const searchParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search) {
      searchParams.append('search', search);
    }
    
    return fetchWithAuth(`/api/v1/urls?${searchParams.toString()}`);
  },

  // Get a single URL by ID
  getUrl: async (id: string): Promise<ShortUrlResponse> => {
    return fetchWithAuth(`/api/v1/urls/${id}`);
  },

  // Update a URL
  updateUrl: async (id: string, data: UpdateUrlRequest): Promise<ShortUrlResponse> => {
    return fetchWithAuth(`/api/v1/urls/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete a URL
  deleteUrl: async (id: string): Promise<void> => {
    return fetchWithAuth(`/api/v1/urls/${id}`, {
      method: 'DELETE',
    });
  },
};
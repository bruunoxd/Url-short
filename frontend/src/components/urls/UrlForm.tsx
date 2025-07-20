'use client';

import { CreateUrlRequest, UpdateUrlRequest } from '@/types/url';
import { useState, useEffect } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';

interface UrlFormProps {
  onSubmit: (data: CreateUrlRequest | UpdateUrlRequest) => Promise<void>;
  isSubmitting: boolean;
  initialData?: {
    originalUrl?: string;
    title?: string;
    tags?: string[];
    isActive?: boolean;
    expiresAt?: string;
  };
  isEditMode?: boolean;
}

export default function UrlForm({
  onSubmit,
  isSubmitting,
  initialData,
  isEditMode = false,
}: UrlFormProps) {
  const [originalUrl, setOriginalUrl] = useState(initialData?.originalUrl || '');
  const [title, setTitle] = useState(initialData?.title || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [isActive, setIsActive] = useState(initialData?.isActive !== false);
  const [expiresAt, setExpiresAt] = useState(initialData?.expiresAt || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      if (initialData.originalUrl) setOriginalUrl(initialData.originalUrl);
      if (initialData.title) setTitle(initialData.title);
      if (initialData.tags) setTags(initialData.tags);
      if (initialData.isActive !== undefined) setIsActive(initialData.isActive);
      if (initialData.expiresAt) setExpiresAt(initialData.expiresAt);
    }
  }, [initialData]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!isEditMode && !originalUrl) {
      newErrors.originalUrl = 'Original URL is required';
    } else if (!isEditMode && !isValidUrl(originalUrl)) {
      newErrors.originalUrl = 'Please enter a valid URL';
    }

    if (title && title.length > 255) {
      newErrors.title = 'Title must be less than 255 characters';
    }

    if (tags.length > 10) {
      newErrors.tags = 'Maximum 10 tags allowed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const formData: CreateUrlRequest | UpdateUrlRequest = isEditMode
      ? {
          title: title || undefined,
          tags: tags.length > 0 ? tags : undefined,
          isActive,
          expiresAt: expiresAt || undefined,
        }
      : {
          originalUrl,
          title: title || undefined,
          tags: tags.length > 0 ? tags : undefined,
          expiresAt: expiresAt || undefined,
        };

    await onSubmit(formData);
  };

  const addTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 10) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isEditMode && (
        <div>
          <label htmlFor="originalUrl" className="block text-sm font-medium text-gray-700">
            Original URL*
          </label>
          <input
            type="text"
            id="originalUrl"
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            placeholder="https://example.com/very-long-url"
            className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm ${
              errors.originalUrl ? 'border-red-300' : ''
            }`}
            disabled={isSubmitting}
          />
          {errors.originalUrl && (
            <p className="mt-2 text-sm text-red-600">{errors.originalUrl}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My awesome link"
          className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm ${
            errors.title ? 'border-red-300' : ''
          }`}
          disabled={isSubmitting}
        />
        {errors.title && <p className="mt-2 text-sm text-red-600">{errors.title}</p>}
      </div>

      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-gray-700">
          Tags
        </label>
        <div className="mt-1 flex rounded-md shadow-sm">
          <input
            type="text"
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add tags"
            className="block w-full rounded-l-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            disabled={isSubmitting || tags.length >= 10}
          />
          <button
            type="button"
            onClick={addTag}
            disabled={!tagInput.trim() || isSubmitting || tags.length >= 10}
            className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 sm:text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            <FiPlus className="h-4 w-4" />
          </button>
        </div>
        {errors.tags && <p className="mt-2 text-sm text-red-600">{errors.tags}</p>}

        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-primary-100 text-primary-800"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={isSubmitting}
                className="ml-1.5 inline-flex text-primary-400 hover:text-primary-600 focus:outline-none"
              >
                <FiX className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {isEditMode && (
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            disabled={isSubmitting}
          />
          <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
            Active
          </label>
        </div>
      )}

      <div>
        <label htmlFor="expiresAt" className="block text-sm font-medium text-gray-700">
          Expiration Date (Optional)
        </label>
        <input
          type="datetime-local"
          id="expiresAt"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
              {isEditMode ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            <>{isEditMode ? 'Update URL' : 'Create URL'}</>
          )}
        </button>
      </div>
    </form>
  );
}
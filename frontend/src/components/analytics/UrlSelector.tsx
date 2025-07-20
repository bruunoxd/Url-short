import React from 'react';
import { ShortUrlResponse } from '@/types/url';

interface UrlSelectorProps {
  urls: ShortUrlResponse[];
  selectedUrlId: string | null;
  onChange: (urlId: string) => void;
}

export default function UrlSelector({ urls, selectedUrlId, onChange }: UrlSelectorProps) {
  if (!urls.length) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              No URLs found. Create a short URL first to view analytics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="url-select" className="block text-sm font-medium text-gray-700 mb-1">
        Select URL
      </label>
      <select
        id="url-select"
        value={selectedUrlId || ''}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
      >
        <option value="" disabled>Select a URL</option>
        {urls.map((url) => (
          <option key={url.id} value={url.id}>
            {url.title || url.originalUrl}
          </option>
        ))}
      </select>
    </div>
  );
}
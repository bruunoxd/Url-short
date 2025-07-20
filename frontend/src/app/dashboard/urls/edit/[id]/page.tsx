'use client';

import { urlApi } from '@/lib/api';
import { ShortUrlResponse, UpdateUrlRequest } from '@/types/url';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FiArrowLeft } from 'react-icons/fi';
import UrlForm from '@/components/urls/UrlForm';

export default function EditUrlPage() {
  const router = useRouter();
  const params = useParams();
  const urlId = params.id as string;
  
  const [url, setUrl] = useState<ShortUrlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchUrl = async () => {
      try {
        setLoading(true);
        const data = await urlApi.getUrl(urlId);
        setUrl(data);
      } catch (error) {
        console.error('Failed to fetch URL:', error);
        toast.error('Failed to load URL details. Please try again.');
        router.push('/dashboard/urls');
      } finally {
        setLoading(false);
      }
    };

    fetchUrl();
  }, [urlId, router]);

  const handleSubmit = async (data: UpdateUrlRequest) => {
    try {
      setSubmitting(true);
      await urlApi.updateUrl(urlId, data);
      toast.success('URL updated successfully!');
      router.push('/dashboard/urls');
    } catch (error) {
      console.error('Failed to update URL:', error);
      toast.error('Failed to update URL. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-600 mb-4">URL not found or you don't have permission to edit it.</p>
        <Link
          href="/dashboard/urls"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
        >
          Back to URLs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link
          href="/dashboard/urls"
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          <FiArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit URL</h1>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Short URL</h2>
          <div className="flex items-center">
            <a
              href={`${process.env.NEXT_PUBLIC_SHORT_URL_DOMAIN || 'http://localhost:3001'}/${url.shortCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-900"
            >
              {`${process.env.NEXT_PUBLIC_SHORT_URL_DOMAIN || 'http://localhost:3001'}/${url.shortCode}`}
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SHORT_URL_DOMAIN || 'http://localhost:3001'}/${url.shortCode}`);
                toast.success('URL copied to clipboard!');
              }}
              className="ml-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Original URL</h2>
          <p className="text-gray-600 break-all">{url.originalUrl}</p>
        </div>

        <UrlForm
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          initialData={{
            title: url.title,
            tags: url.tags,
            isActive: url.isActive,
            expiresAt: url.expiresAt,
          }}
          isEditMode={true}
        />
      </div>
    </div>
  );
}
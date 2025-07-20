'use client';

import { urlApi } from '@/lib/api';
import { CreateUrlRequest } from '@/types/url';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { FiArrowLeft } from 'react-icons/fi';
import UrlForm from '@/components/urls/UrlForm';

export default function CreateUrlPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: CreateUrlRequest) => {
    try {
      setLoading(true);
      await urlApi.createUrl(data);
      toast.success('URL created successfully!');
      router.push('/dashboard/urls');
    } catch (error) {
      console.error('Failed to create URL:', error);
      toast.error('Failed to create URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link
          href="/dashboard/urls"
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          <FiArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create New URL</h1>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <UrlForm onSubmit={handleSubmit} isSubmitting={loading} />
      </div>
    </div>
  );
}
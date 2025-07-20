'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome, {user?.name || 'User'}!</h1>
        <p className="text-gray-600 mb-6">
          Manage your shortened URLs and view analytics from your dashboard.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Create Short URL</h2>
            <p className="text-gray-600 mb-4">
              Create short, memorable links for your content that are easy to share.
            </p>
            <Link
              href="/dashboard/urls/create"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              Create URL
            </Link>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Manage URLs</h2>
            <p className="text-gray-600 mb-4">
              View, edit, and manage all your shortened URLs in one place.
            </p>
            <Link
              href="/dashboard/urls"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              View URLs
            </Link>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Analytics</h2>
            <p className="text-gray-600 mb-4">
              View detailed analytics and insights for your shortened URLs.
            </p>
            <Link
              href="/dashboard/analytics"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              View Analytics
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { AnalyticsData } from '@/types/analytics';

interface AnalyticsSummaryProps {
  data: AnalyticsData;
}

export default function AnalyticsSummary({ data }: AnalyticsSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500">Total Clicks</h3>
        <p className="text-3xl font-bold text-primary-600">{data.totalClicks.toLocaleString()}</p>
      </div>
      
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500">Unique Visitors</h3>
        <p className="text-3xl font-bold text-primary-600">{data.uniqueVisitors.toLocaleString()}</p>
      </div>
      
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
        <p className="text-3xl font-bold text-primary-600">
          {data.totalClicks > 0 
            ? `${((data.uniqueVisitors / data.totalClicks) * 100).toFixed(1)}%` 
            : '0%'}
        </p>
      </div>
    </div>
  );
}
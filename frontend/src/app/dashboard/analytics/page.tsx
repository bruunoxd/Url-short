'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { urlApi } from '@/lib/api';
import { analyticsApi } from '@/lib/analyticsApi';
import { AnalyticsData, AnalyticsTimeRange } from '@/types/analytics';
import { ShortUrlResponse } from '@/types/url';
import AnalyticsSummary from '@/components/analytics/AnalyticsSummary';
import TimeSeriesChart from '@/components/analytics/TimeSeriesChart';
import GeoMap from '@/components/analytics/GeoMap';
import DeviceBreakdown from '@/components/analytics/DeviceBreakdown';
import BrowserBreakdown from '@/components/analytics/BrowserBreakdown';
import ReferrerTable from '@/components/analytics/ReferrerTable';
import TimeRangeSelector from '@/components/analytics/TimeRangeSelector';
import UrlSelector from '@/components/analytics/UrlSelector';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const urlId = searchParams.get('urlId');
  
  const [selectedUrlId, setSelectedUrlId] = useState<string | null>(urlId);
  const [urls, setUrls] = useState<ShortUrlResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    endDate: new Date().toISOString(),
    granularity: 'day',
  });

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket(
    selectedUrlId ? `ws://${window.location.hostname}:3001/analytics/${selectedUrlId}` : null
  );

  // Fetch user's URLs
  useEffect(() => {
    const fetchUrls = async () => {
      try {
        const response = await urlApi.getUrls(1, 100);
        setUrls(response.urls);
        
        // If no URL is selected and we have URLs, select the first one
        if (!selectedUrlId && response.urls.length > 0) {
          setSelectedUrlId(response.urls[0].id);
        }
      } catch (error) {
        console.error('Error fetching URLs:', error);
      }
    };
    
    fetchUrls();
  }, [selectedUrlId]);

  // Fetch analytics data when URL or time range changes
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      if (!selectedUrlId) return;
      
      setLoading(true);
      try {
        const data = await analyticsApi.getUrlAnalytics(selectedUrlId, timeRange);
        setAnalyticsData(data);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalyticsData();
  }, [selectedUrlId, timeRange]);

  // Handle real-time updates from WebSocket
  useEffect(() => {
    if (!lastMessage || !analyticsData) return;
    
    try {
      const message = JSON.parse(lastMessage.data);
      
      if (message.type === 'click') {
        // Update analytics data with new click
        setAnalyticsData(prevData => {
          if (!prevData) return prevData;
          
          return {
            ...prevData,
            totalClicks: prevData.totalClicks + 1,
            // We would need more complex logic to update other parts of the analytics data
            // This is a simplified example
          };
        });
      } else if (message.type === 'stats_update') {
        // Update summary stats
        setAnalyticsData(prevData => {
          if (!prevData) return prevData;
          
          return {
            ...prevData,
            totalClicks: message.data.totalClicks,
            uniqueVisitors: message.data.uniqueVisitors,
          };
        });
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, [lastMessage, analyticsData]);

  const handleUrlChange = (urlId: string) => {
    setSelectedUrlId(urlId);
  };

  const handleTimeRangeChange = (newTimeRange: AnalyticsTimeRange) => {
    setTimeRange(newTimeRange);
  };

  const selectedUrl = urls.find(url => url.id === selectedUrlId);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Analytics Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <UrlSelector 
            urls={urls} 
            selectedUrlId={selectedUrlId} 
            onChange={handleUrlChange} 
          />
          <TimeRangeSelector 
            timeRange={timeRange} 
            onChange={handleTimeRangeChange} 
          />
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : selectedUrlId && analyticsData ? (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Analytics for: {selectedUrl?.title || selectedUrl?.originalUrl}
              </h2>
              <p className="text-sm text-gray-500">
                Short URL: {`${window.location.origin}/${selectedUrl?.shortCode}`}
              </p>
            </div>
            
            <AnalyticsSummary data={analyticsData} />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Clicks Over Time</h3>
                <TimeSeriesChart data={analyticsData.clicksByDate} />
              </div>
              
              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Geographic Distribution</h3>
                <GeoMap data={analyticsData.clicksByCountry} />
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Device Breakdown</h3>
                <DeviceBreakdown data={analyticsData.clicksByDevice} />
              </div>
              
              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Browser Breakdown</h3>
                <BrowserBreakdown data={analyticsData.clicksByBrowser} />
              </div>
            </div>
            
            <div className="bg-white shadow rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Top Referrers</h3>
              <ReferrerTable data={analyticsData.topReferrers} />
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Select a URL to view analytics</p>
          </div>
        )}
      </div>
    </div>
  );
}
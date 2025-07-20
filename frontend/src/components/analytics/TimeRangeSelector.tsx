import React from 'react';
import { AnalyticsTimeRange } from '@/types/analytics';
import { format, subDays, subMonths } from 'date-fns';

interface TimeRangeSelectorProps {
  timeRange: AnalyticsTimeRange;
  onChange: (timeRange: AnalyticsTimeRange) => void;
}

export default function TimeRangeSelector({ timeRange, onChange }: TimeRangeSelectorProps) {
  const handlePresetChange = (preset: string) => {
    const now = new Date();
    let startDate: Date;
    let granularity: 'hour' | 'day' | 'week' | 'month' = 'day';
    
    switch (preset) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        granularity = 'hour';
        break;
      case 'yesterday':
        startDate = subDays(new Date(now.setHours(0, 0, 0, 0)), 1);
        granularity = 'hour';
        break;
      case '7days':
        startDate = subDays(now, 7);
        granularity = 'day';
        break;
      case '30days':
        startDate = subDays(now, 30);
        granularity = 'day';
        break;
      case '90days':
        startDate = subDays(now, 90);
        granularity = 'day';
        break;
      case '6months':
        startDate = subMonths(now, 6);
        granularity = 'week';
        break;
      case '12months':
        startDate = subMonths(now, 12);
        granularity = 'month';
        break;
      default:
        startDate = subDays(now, 30);
        granularity = 'day';
    }
    
    onChange({
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      granularity,
    });
  };

  const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'startDate' | 'endDate') => {
    const date = new Date(e.target.value);
    
    if (!isNaN(date.getTime())) {
      onChange({
        ...timeRange,
        [field]: date.toISOString(),
      });
    }
  };

  const handleGranularityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...timeRange,
      granularity: e.target.value as 'hour' | 'day' | 'week' | 'month',
    });
  };

  // Format dates for input fields
  const formatDateForInput = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'yyyy-MM-dd');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePresetChange('today')}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('yesterday')}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('7days')}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Last 7 days
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('30days')}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Last 30 days
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('90days')}
            className="px-3 py-1 text-xs rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Last 90 days
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            value={formatDateForInput(timeRange.startDate)}
            onChange={(e) => handleCustomDateChange(e, 'startDate')}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            value={formatDateForInput(timeRange.endDate)}
            onChange={(e) => handleCustomDateChange(e, 'endDate')}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="granularity" className="block text-sm font-medium text-gray-700 mb-1">
            Granularity
          </label>
          <select
            id="granularity"
            value={timeRange.granularity}
            onChange={handleGranularityChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>
    </div>
  );
}
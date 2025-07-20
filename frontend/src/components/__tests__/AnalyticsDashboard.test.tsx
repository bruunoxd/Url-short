import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AnalyticsSummary from '../analytics/AnalyticsSummary';
import TimeSeriesChart from '../analytics/TimeSeriesChart';
import DeviceBreakdown from '../analytics/DeviceBreakdown';
import BrowserBreakdown from '../analytics/BrowserBreakdown';
import ReferrerTable from '../analytics/ReferrerTable';
import TimeRangeSelector from '../analytics/TimeRangeSelector';
import UrlSelector from '../analytics/UrlSelector';
import { AnalyticsTimeRange } from '@/types/analytics';

// Mock Chart.js to avoid canvas rendering issues in tests
jest.mock('chart.js/auto', () => ({
  __esModule: true,
  default: class {
    constructor() {
      this.destroy = jest.fn();
    }
  },
}));

// Mock d3 and topojson-client for GeoMap
jest.mock('d3', () => ({
  select: jest.fn(() => ({
    select: jest.fn(() => ({
      remove: jest.fn(),
    })),
    append: jest.fn(() => ({
      attr: jest.fn(() => ({
        attr: jest.fn(() => ({
          attr: jest.fn(() => ({
            append: jest.fn(() => ({
              text: jest.fn(),
            })),
          })),
        })),
      })),
    })),
  })),
  geoMercator: jest.fn(() => ({
    scale: jest.fn(() => ({
      center: jest.fn(() => ({
        translate: jest.fn(),
      })),
    })),
  })),
  geoPath: jest.fn(() => ({
    projection: jest.fn(),
  })),
  scaleSequential: jest.fn(() => ({
    domain: jest.fn(),
  })),
  interpolateBlues: jest.fn(),
  json: jest.fn(() => Promise.resolve({})),
  max: jest.fn(() => 100),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn(() => ({
      on: jest.fn(),
    })),
  })),
}));

jest.mock('topojson-client', () => ({
  feature: jest.fn(() => ({
    features: [],
  })),
}));

describe('Analytics Components', () => {
  const mockAnalyticsData = {
    totalClicks: 1250,
    uniqueVisitors: 850,
    clicksByDate: [
      { date: '2025-07-01T00:00:00.000Z', clicks: 120, uniqueVisitors: 80 },
      { date: '2025-07-02T00:00:00.000Z', clicks: 150, uniqueVisitors: 100 },
      { date: '2025-07-03T00:00:00.000Z', clicks: 180, uniqueVisitors: 120 },
    ],
    clicksByCountry: [
      { country: 'United States', clicks: 500, percentage: 40 },
      { country: 'Brazil', clicks: 300, percentage: 24 },
      { country: 'Germany', clicks: 200, percentage: 16 },
    ],
    clicksByDevice: [
      { deviceType: 'Desktop', clicks: 700, percentage: 56 },
      { deviceType: 'Mobile', clicks: 450, percentage: 36 },
      { deviceType: 'Tablet', clicks: 100, percentage: 8 },
    ],
    clicksByBrowser: [
      { browser: 'Chrome', clicks: 600, percentage: 48 },
      { browser: 'Safari', clicks: 350, percentage: 28 },
      { browser: 'Firefox', clicks: 200, percentage: 16 },
      { browser: 'Edge', clicks: 100, percentage: 8 },
    ],
    topReferrers: [
      { referrer: 'https://google.com', clicks: 400, percentage: 32 },
      { referrer: 'https://facebook.com', clicks: 300, percentage: 24 },
      { referrer: 'direct', clicks: 250, percentage: 20 },
    ],
  };

  const mockUrls = [
    { id: '1', title: 'Google', originalUrl: 'https://google.com', shortCode: 'abc123' },
    { id: '2', title: 'Facebook', originalUrl: 'https://facebook.com', shortCode: 'def456' },
  ];

  const mockTimeRange: AnalyticsTimeRange = {
    startDate: '2025-06-16T00:00:00.000Z',
    endDate: '2025-07-16T00:00:00.000Z',
    granularity: 'day',
  };

  test('AnalyticsSummary renders correctly', () => {
    render(<AnalyticsSummary data={mockAnalyticsData} />);
    
    expect(screen.getByText('Total Clicks')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('Unique Visitors')).toBeInTheDocument();
    expect(screen.getByText('850')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('68.0%')).toBeInTheDocument();
  });

  test('TimeSeriesChart renders with data', () => {
    render(<TimeSeriesChart data={mockAnalyticsData.clicksByDate} />);
    // Since we're mocking Chart.js, we just verify the component renders without errors
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });

  test('TimeSeriesChart shows no data message when empty', () => {
    render(<TimeSeriesChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  test('DeviceBreakdown renders with data', () => {
    render(<DeviceBreakdown data={mockAnalyticsData.clicksByDevice} />);
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });

  test('DeviceBreakdown shows no data message when empty', () => {
    render(<DeviceBreakdown data={[]} />);
    expect(screen.getByText('No device data available')).toBeInTheDocument();
  });

  test('BrowserBreakdown renders with data', () => {
    render(<BrowserBreakdown data={mockAnalyticsData.clicksByBrowser} />);
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });

  test('BrowserBreakdown shows no data message when empty', () => {
    render(<BrowserBreakdown data={[]} />);
    expect(screen.getByText('No browser data available')).toBeInTheDocument();
  });

  test('ReferrerTable renders correctly', () => {
    render(<ReferrerTable data={mockAnalyticsData.topReferrers} />);
    
    expect(screen.getByText('Referrer')).toBeInTheDocument();
    expect(screen.getByText('Clicks')).toBeInTheDocument();
    expect(screen.getByText('Percentage')).toBeInTheDocument();
    expect(screen.getByText('google.com')).toBeInTheDocument();
    expect(screen.getByText('facebook.com')).toBeInTheDocument();
    expect(screen.getByText('Direct / No Referrer')).toBeInTheDocument();
  });

  test('ReferrerTable shows no data message when empty', () => {
    render(<ReferrerTable data={[]} />);
    expect(screen.getByText('No referrer data available')).toBeInTheDocument();
  });

  test('TimeRangeSelector renders correctly', () => {
    const handleChange = jest.fn();
    render(<TimeRangeSelector timeRange={mockTimeRange} onChange={handleChange} />);
    
    expect(screen.getByText('Time Range')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Granularity')).toBeInTheDocument();
  });

  test('UrlSelector renders correctly with URLs', () => {
    const handleChange = jest.fn();
    render(
      <UrlSelector 
        urls={mockUrls} 
        selectedUrlId="1" 
        onChange={handleChange} 
      />
    );
    
    expect(screen.getByText('Select URL')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
  });

  test('UrlSelector shows warning when no URLs', () => {
    const handleChange = jest.fn();
    render(
      <UrlSelector 
        urls={[]} 
        selectedUrlId={null} 
        onChange={handleChange} 
      />
    );
    
    expect(screen.getByText('No URLs found. Create a short URL first to view analytics.')).toBeInTheDocument();
  });
});
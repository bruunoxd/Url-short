import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

interface BrowserData {
  browser: string;
  clicks: number;
  percentage: number;
}

interface BrowserBreakdownProps {
  data: BrowserData[];
}

export default function BrowserBreakdown({ data }: BrowserBreakdownProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    // Destroy previous chart instance if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Define colors for common browsers
    const browserColors: Record<string, string> = {
      chrome: 'rgba(66, 133, 244, 0.8)',
      firefox: 'rgba(255, 89, 0, 0.8)',
      safari: 'rgba(0, 122, 255, 0.8)',
      edge: 'rgba(0, 120, 215, 0.8)',
      opera: 'rgba(255, 0, 0, 0.8)',
      ie: 'rgba(0, 120, 215, 0.8)',
    };

    // Create new chart
    chartInstance.current = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: data.map(item => item.browser),
        datasets: [
          {
            data: data.map(item => item.clicks),
            backgroundColor: data.map(item => {
              const browserKey = Object.keys(browserColors).find(key => 
                item.browser.toLowerCase().includes(key)
              );
              return browserKey ? browserColors[browserKey] : 'rgba(153, 102, 255, 0.8)';
            }),
            borderColor: 'white',
            borderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.raw as number;
                const dataset = context.dataset;
                const total = dataset.data.reduce((acc: number, data: number) => acc + data, 0);
                const percentage = Math.round((value / total) * 100);
                return `${label}: ${value} clicks (${percentage}%)`;
              }
            }
          }
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data]);

  if (!data.length) {
    return (
      <div className="flex justify-center items-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No browser data available</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <canvas ref={chartRef}></canvas>
    </div>
  );
}
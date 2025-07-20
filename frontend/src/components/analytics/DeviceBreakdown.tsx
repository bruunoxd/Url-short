import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

interface DeviceData {
  deviceType: string;
  clicks: number;
  percentage: number;
}

interface DeviceBreakdownProps {
  data: DeviceData[];
}

export default function DeviceBreakdown({ data }: DeviceBreakdownProps) {
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

    // Define colors for different device types
    const deviceColors: Record<string, string> = {
      desktop: 'rgba(54, 162, 235, 0.8)',
      mobile: 'rgba(255, 99, 132, 0.8)',
      tablet: 'rgba(255, 206, 86, 0.8)',
      other: 'rgba(75, 192, 192, 0.8)',
    };

    // Create new chart
    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(item => item.deviceType),
        datasets: [
          {
            data: data.map(item => item.clicks),
            backgroundColor: data.map(item => 
              deviceColors[item.deviceType.toLowerCase()] || 'rgba(153, 102, 255, 0.8)'
            ),
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
        <p className="text-gray-500">No device data available</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <canvas ref={chartRef}></canvas>
    </div>
  );
}
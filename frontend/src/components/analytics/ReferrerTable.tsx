import React from 'react';

interface ReferrerData {
  referrer: string;
  clicks: number;
  percentage: number;
}

interface ReferrerTableProps {
  data: ReferrerData[];
}

export default function ReferrerTable({ data }: ReferrerTableProps) {
  // Format referrer URL for display
  const formatReferrer = (referrer: string): string => {
    if (!referrer || referrer === 'direct') return 'Direct / No Referrer';
    
    try {
      const url = new URL(referrer);
      return url.hostname;
    } catch (error) {
      return referrer;
    }
  };

  if (!data.length) {
    return (
      <div className="flex justify-center items-center h-32 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No referrer data available</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Referrer
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Clicks
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Percentage
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, index) => (
            <tr key={index}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {formatReferrer(item.referrer)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {item.clicks}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {item.percentage.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
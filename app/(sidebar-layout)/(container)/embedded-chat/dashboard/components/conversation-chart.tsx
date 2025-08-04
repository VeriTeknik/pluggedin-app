'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ConversationChartProps {
  chatUuid: string;
}

export function ConversationChart({ chatUuid }: ConversationChartProps) {
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    // Generate sample data for the last 7 days
    const labels = [];
    const conversationData = [];
    const messageData = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en', { weekday: 'short' }));
      
      // Generate random sample data
      conversationData.push(Math.floor(Math.random() * 20) + 5);
      messageData.push(Math.floor(Math.random() * 100) + 20);
    }

    setChartData({
      labels,
      datasets: [
        {
          label: 'Conversations',
          data: conversationData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Messages',
          data: messageData,
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    });
  }, [chatUuid]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Conversations',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Messages',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (!chartData) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Loading chart data...
      </div>
    );
  }

  return (
    <div className="h-[300px]">
      <Line options={options} data={chartData} />
    </div>
  );
}
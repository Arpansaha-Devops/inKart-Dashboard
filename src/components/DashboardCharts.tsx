import React, { useEffect, useMemo } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

type ChartThemeColors = {
  textSecondary: string;
  border: string;
};

type DashboardChartData = {
  labels: string[];
  datasets: {
    data: number[];
    backgroundColor: string[] | string;
    borderWidth?: number;
    borderRadius?: number;
    borderSkipped?: false;
  }[];
};

type DashboardChartsProps = {
  chart: 'products' | 'coupons';
  chartTheme: ChartThemeColors;
  doughnutData: DashboardChartData;
  barData: DashboardChartData;
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const DashboardCharts: React.FC<DashboardChartsProps> = ({
  chart,
  chartTheme,
  doughnutData,
  barData,
}) => {
  useEffect(() => {
    ChartJS.defaults.color = chartTheme.textSecondary;
    ChartJS.defaults.borderColor = chartTheme.border;
    ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif";
  }, [chartTheme]);

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: chartTheme.textSecondary,
            font: { size: 13 },
            boxWidth: 12,
            padding: 16,
          },
        },
        title: { display: false },
      },
    }),
    [chartTheme]
  );

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: {
          grid: { color: chartTheme.border },
          ticks: { color: chartTheme.textSecondary },
        },
        y: {
          beginAtZero: true,
          grid: { color: chartTheme.border },
          ticks: { color: chartTheme.textSecondary },
        },
      },
    }),
    [chartTheme]
  );

  return chart === 'products' ? (
    <Doughnut data={doughnutData} options={doughnutOptions} />
  ) : (
    <Bar data={barData} options={barOptions} />
  );
};

export default DashboardCharts;

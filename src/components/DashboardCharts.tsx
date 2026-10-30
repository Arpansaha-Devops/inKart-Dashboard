import React, { useMemo } from 'react';
import { Bar, Doughnut } from '../lib/chartRuntime';

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

const DashboardCharts: React.FC<DashboardChartsProps> = ({
  chart,
  chartTheme,
  doughnutData,
  barData,
}) => {
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
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const idx = context.dataIndex;
              const dataset = context.dataset || {};
              const fullLabel = (dataset as any).fullLabels?.[idx] ?? context.label;
              const value = context.parsed ?? context.raw ?? '';
              return `${fullLabel}: ${value}`;
            },
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

  return (
    <>
      {chart === 'products' ? (
        <Doughnut data={doughnutData} options={doughnutOptions} />
      ) : (
        <Bar data={barData} options={barOptions} />
      )}
    </>
  );
};

export default DashboardCharts;

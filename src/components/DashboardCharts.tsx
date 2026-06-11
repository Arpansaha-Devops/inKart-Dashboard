import React, { lazy, Suspense, useMemo } from 'react';

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

type ChartRendererProps = {
  data: DashboardChartData;
  options: Record<string, unknown>;
};

const createLazyChart = (variant: 'bar' | 'doughnut') =>
  lazy(async () => {
    const [chartComponents, chartJs] = await Promise.all([
      import('react-chartjs-2'),
      import('chart.js'),
    ]);

    chartJs.Chart.register(
      chartJs.CategoryScale,
      chartJs.LinearScale,
      chartJs.BarElement,
      chartJs.PointElement,
      chartJs.ArcElement,
      chartJs.Title,
      chartJs.Tooltip,
      chartJs.Legend
    );

    const ChartComponent = variant === 'bar' ? chartComponents.Bar : chartComponents.Doughnut;

    return {
      default: ({ data, options }: ChartRendererProps) => (
        <ChartComponent data={data} options={options} />
      ),
    };
  });

const LazyBarChart = createLazyChart('bar');
const LazyDoughnutChart = createLazyChart('doughnut');

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
    <Suspense fallback={<div className="skeleton" style={{ width: '100%', height: '100%' }} />}>
      {chart === 'products' ? (
        <LazyDoughnutChart data={doughnutData} options={doughnutOptions} />
      ) : (
        <LazyBarChart data={barData} options={barOptions} />
      )}
    </Suspense>
  );
};

export default DashboardCharts;

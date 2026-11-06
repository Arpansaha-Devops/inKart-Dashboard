import { lazy } from 'react';

type ChartComponents = Pick<typeof import('react-chartjs-2'), 'Bar' | 'Doughnut' | 'Line'>;
let chartComponents: Promise<ChartComponents> | undefined;

// Route prefetches can load this wrapper without loading the heavy libraries.
// Share one runtime and registration when a chart first renders.
function loadChartComponents() {
  return chartComponents ??= Promise.all([
    import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement, PointElement, ArcElement,
      LineElement, Title, Tooltip, Legend, Filler,
    }) => {
      Chart.register(CategoryScale, LinearScale, BarElement, PointElement, ArcElement,
        LineElement, Title, Tooltip, Legend, Filler);
    }),
    import('react-chartjs-2').then(({ Bar, Doughnut, Line }) => ({ Bar, Doughnut, Line })),
  ]).then(([, components]) => components).catch((error) => {
    chartComponents = undefined;
    throw error;
  });
}

export const Bar = lazy(() => loadChartComponents().then((components) => ({ default: components.Bar })));
export const Doughnut = lazy(() => loadChartComponents().then((components) => ({ default: components.Doughnut })));
export const Line = lazy(() => loadChartComponents().then((components) => ({ default: components.Line })));

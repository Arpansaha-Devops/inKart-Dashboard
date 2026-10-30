// Loaded only by chart routes. Share one registration and include only the
// elements/controllers used by the dashboard and revenue charts.
import {
  Chart, CategoryScale, LinearScale, BarElement, PointElement, ArcElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(CategoryScale, LinearScale, BarElement, PointElement, ArcElement,
  LineElement, Title, Tooltip, Legend, Filler);

export { Bar, Doughnut, Line } from 'react-chartjs-2';

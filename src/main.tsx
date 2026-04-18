import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const THEME_STORAGE_KEY = 'inkart-dashboard-theme';

const storedTheme =
  typeof window !== 'undefined' && window.localStorage.getItem(THEME_STORAGE_KEY) === 'light'
    ? 'light'
    : 'dark';

document.body.classList.remove('light', 'dark');
document.body.classList.add(storedTheme);
document.body.style.colorScheme = storedTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const THEME_STORAGE_KEY = 'inkart-dashboard-theme';
const LEGACY_DELETED_CATEGORIES_STORAGE_KEY = 'inkart-dashboard-deleted-categories';

if (typeof window !== 'undefined') {
  window.localStorage.removeItem(LEGACY_DELETED_CATEGORIES_STORAGE_KEY);
}

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

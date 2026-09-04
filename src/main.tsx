import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const THEME_STORAGE_KEY = 'printfrint-dashboard-theme';
const LEGACY_THEME_STORAGE_KEY = 'inkart-dashboard-theme';

const getStoredTheme = () => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const currentTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  const storedTheme = currentTheme ?? legacyTheme;
  const resolvedTheme = storedTheme === 'light' ? 'light' : 'dark';

  if (currentTheme === null && (legacyTheme === 'light' || legacyTheme === 'dark')) {
    window.localStorage.setItem(THEME_STORAGE_KEY, legacyTheme);
  }

  return resolvedTheme;
};

const storedTheme = getStoredTheme();

document.body.classList.remove('light', 'dark');
document.body.classList.add(storedTheme);
document.body.style.colorScheme = storedTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

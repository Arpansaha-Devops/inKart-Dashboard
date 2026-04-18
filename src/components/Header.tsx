import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, MoonStar, SunMedium } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
}

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'inkart-dashboard-theme';

const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'light' ? 'light' : 'dark';
};

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  products: 'Products',
  categories: 'Categories',
  coupons: 'Coupons',
};

const Header: React.FC<HeaderProps> = ({ onMenuToggle, isSidebarOpen = false }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  const currentKey = location.pathname.split('/')[1] || 'dashboard';
  const pageTitle = pageTitles[currentKey] || 'Dashboard';
  const avatarInitial = user?.name?.trim().charAt(0).toUpperCase() || 'I';
  const toggleLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  useEffect(() => {
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(theme);
    document.body.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }, [theme]);

  return (
    <header
      style={{
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        minHeight: 60,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
        }}
      >
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Toggle sidebar"
          aria-expanded={isSidebarOpen}
          className="action-icon-button mobile-header-toggle"
        >
          <Menu size={20} />
        </button>

        <h2
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {pageTitle}
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="theme-toggle-button"
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
        </button>

        <div
          title={user?.name || 'InkArt Admin'}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--avatar-shadow)',
          }}
        >
          {avatarInitial}
        </div>
      </div>
    </header>
  );
};

export default Header;

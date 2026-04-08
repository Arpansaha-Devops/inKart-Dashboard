import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle, isSidebarOpen = false }) => {
  const { user } = useAuth();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname.split('/')[1];
    return path.charAt(0).toUpperCase() + path.slice(1) || 'Dashboard';
  };

  return (
    <header className="h-14 sm:h-16 md:h-16 lg:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 sticky top-0 z-20">
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          aria-label="Toggle menu"
        >
          <Menu size={20} className="text-gray-600" />
        </button>
        <h2 className="text-base sm:text-lg md:text-xl lg:text-xl font-semibold text-gray-800 truncate">
          {getPageTitle()}
        </h2>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        <div className="text-right hidden xs:block">
          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[120px] sm:max-w-[150px]">
            Welcome, {user?.name?.split(' ')[0] || 'Admin'}
          </p>
          <p className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[150px]">
            {user?.email?.split('@')[0] || 'admin'}
          </p>
        </div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
          {user?.name?.charAt(0) || 'A'}
        </div>
      </div>
    </header>
  );
};

export default Header;

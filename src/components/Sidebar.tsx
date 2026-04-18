import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  LayoutDashboard,
  LogOut,
  Package,
  Tag,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Customers', path: '/customers', icon: Users },
  { name: 'Products', path: '/products', icon: Package },
  { name: 'Categories', path: '/categories', icon: Tag },
  { name: 'Coupons', path: '/coupons', icon: Ticket },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose = () => {} }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
      logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      console.error('Logout error', error);
      logout();
      navigate('/login');
    } finally {
      setIsLogoutModalOpen(false);
    }
  };

  const handleNavClick = () => {
    onClose();
  };

  useEffect(() => {
    if (!isLogoutModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLogoutModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isLogoutModalOpen]);

  const renderNavigation = (mobile = false) => (
    <>
      <div
        style={{
          padding: mobile ? '20px 20px 18px' : '24px 20px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '28px',
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              color: 'var(--accent)',
            }}
          >
            InkArt
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '11px',
              lineHeight: 1.4,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
            }}
          >
            Admin Panel
          </p>
        </div>

        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            className="action-icon-button lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <p
          style={{
            margin: '0 0 16px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
          }}
        >
          Menu
        </p>

        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'is-active' : ''}`
              }
            >
              <item.icon size={18} />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div
        style={{
          padding: '20px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <button
          type="button"
          onClick={() => setIsLogoutModalOpen(true)}
          className="sidebar-nav-item sidebar-nav-item--danger"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className="hidden lg:flex lg:flex-col"
        style={{
          width: 'var(--sidebar-width)',
          minWidth: 'var(--sidebar-width)',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          height: '100vh',
        }}
      >
        {renderNavigation()}
      </aside>

      <div
        className="lg:hidden"
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClose();
          }
        }}
        role="button"
        tabIndex={isOpen ? 0 : -1}
        aria-label="Close sidebar"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-backdrop)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          zIndex: 39,
        }}
      />

      <aside
        className="lg:hidden"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'var(--sidebar-width)',
          maxWidth: '88vw',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          zIndex: 40,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--sidebar-panel-shadow)',
        }}
      >
        {renderNavigation(true)}
      </aside>

      {isLogoutModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsLogoutModalOpen(false)}>
          <div
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '400px' }}
          >
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'var(--danger-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <AlertTriangle size={24} color="var(--danger)" />
              </div>

              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  margin: '0 0 8px',
                  color: 'var(--text-primary)',
                }}
              >
                Log out?
              </h2>
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                You’ll need to sign in again to access the dashboard.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setIsLogoutModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                style={{ flex: 1 }}
                onClick={handleLogout}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default Sidebar;

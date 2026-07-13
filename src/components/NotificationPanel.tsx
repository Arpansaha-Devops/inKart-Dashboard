import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Clock3,
  Mail,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  timestamp: string;
};

type ActivityItem = {
  id: string;
  actor: string;
  description: string;
  timestamp: string;
};

type ManagerContact = {
  id: string;
  name: string;
  role: string;
};

const notificationItems: NotificationItem[] = [];
const activityItems: ActivityItem[] = [];
const managerContacts: ManagerContact[] = [];

const HEADER_OFFSET_TOP = 12;

const getViewportWidth = () => {
  if (typeof window === 'undefined') {
    return 1440;
  }

  return window.innerWidth;
};

const getAvatarLabel = (value: string) => {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
};

const EmptySection: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '14px',
      borderRadius: 'var(--radius-md)',
      border: '1px dashed var(--border)',
      background: 'var(--bg-card)',
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--bg-input)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--text-secondary)',
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          margin: '0 0 4px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: 0,
          color: 'var(--text-muted)',
          fontSize: '12px',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  </div>
);

const NotificationPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(getViewportWidth);
  const panelRef = useRef<HTMLElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  const closePanel = () => {
    if (panelRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }

    setIsOpen(false);
    requestAnimationFrame(() => {
      toggleButtonRef.current?.focus();
    });
  };

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setViewportWidth(window.innerWidth);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const panelWidth = viewportWidth < 768 ? '100vw' : viewportWidth < 1024 ? 320 : 380;

  const panelMarkup = (
    <>
      {isOpen ? (
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close notification panel"
          style={{
            position: 'fixed',
            inset: 0,
            border: 'none',
            background: 'rgba(0, 0, 0, 0.4)',
            cursor: 'pointer',
            zIndex: 40,
          }}
        />
      ) : null}

      <button
        ref={toggleButtonRef}
        type="button"
        onClick={() => {
          setViewportWidth(window.innerWidth);
          setIsOpen((current) => !current);
        }}
        aria-label={isOpen ? 'Hide notifications panel' : 'Show notifications panel'}
        aria-expanded={isOpen}
        style={{
          position: 'fixed',
          top: HEADER_OFFSET_TOP,
          right: isOpen ? 64 : 120,
          width: 40,
          height: 40,
          borderRadius: '999px',
          border: '1px solid var(--border)',
          background: isOpen ? 'var(--accent-muted)' : 'var(--bg-surface)',
          color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 60,
          transition:
            'right 180ms ease, background 180ms ease, border-color 180ms ease, color 180ms ease, transform 120ms ease',
          boxShadow: isOpen ? '0 10px 24px rgba(249, 115, 22, 0.14)' : 'var(--shadow-card)',
        }}
      >
        <Bell size={18} />
      </button>

      <aside
        ref={panelRef}
        aria-hidden={!isOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease-in-out',
          zIndex: 50,
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            minHeight: 64,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
          }}
        >
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Panel
          </p>
          <button
            type="button"
            className="action-icon-button"
            onClick={closePanel}
            aria-label="Close notification panel"
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="hide-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px',
            display: 'grid',
            gap: '22px',
          }}
        >
          <section style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--accent-muted)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Bell size={16} />
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Notifications
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Dynamic-ready list for future API data
                </p>
              </div>
            </div>

            {notificationItems.length > 0 ? (
              notificationItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'var(--accent-muted)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: '0 0 4px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      {item.title}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        lineHeight: 1.55,
                      }}
                    >
                      {item.message}
                    </p>
                  </div>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {item.timestamp}
                  </span>
                </div>
              ))
            ) : (
              <EmptySection
                icon={<Bell size={16} />}
                title="No notifications yet"
                description="Notification items can be mapped here whenever your API is ready."
              />
            )}
          </section>

          <section style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--info-muted)',
                  color: 'var(--info)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Clock3 size={16} />
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Activities
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Recent actions can be rendered from a mapped array
                </p>
              </div>
            </div>

            {activityItems.length > 0 ? (
              activityItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {getAvatarLabel(item.actor) || 'A'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: '0 0 4px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      {item.actor}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        lineHeight: 1.55,
                      }}
                    >
                      {item.description}
                    </p>
                  </div>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {item.timestamp}
                  </span>
                </div>
              ))
            ) : (
              <EmptySection
                icon={<Clock3 size={16} />}
                title="No activity items yet"
                description="Activity rows can be populated later without changing the panel structure."
              />
            )}
          </section>

          <section style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--success-muted)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Users size={16} />
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Contacts of your managers
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Manager contact records can be rendered here dynamically
                </p>
              </div>
            </div>

            {managerContacts.length > 0 ? (
              managerContacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'var(--warning-muted)',
                      color: 'var(--warning)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {getAvatarLabel(contact.name) || 'M'}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: '0 0 4px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      {contact.name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                      }}
                    >
                      {contact.role}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      aria-label={`Email ${contact.name}`}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Call ${contact.name}`}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Phone size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`More actions for ${contact.name}`}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptySection
                icon={<ShieldCheck size={16} />}
                title="No manager contacts yet"
                description="Manager contact cards can be mapped from a future API response."
              />
            )}
          </section>
        </div>
      </aside>
    </>
  );

  if (typeof document === 'undefined') {
    return panelMarkup;
  }

  return createPortal(panelMarkup, document.body);
};

export default NotificationPanel;

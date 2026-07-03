import { createContext, use, useMemo, useState, type ReactNode } from 'react';

interface NotificationContextType {
  isNotificationOpen: boolean;
  setIsNotificationOpen: (open: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState(true);
  const value = useMemo(
    () => ({ isNotificationOpen, setIsNotificationOpen }),
    [isNotificationOpen]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = use(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

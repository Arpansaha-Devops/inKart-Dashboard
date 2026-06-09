import React, { createContext, useContext, useMemo, useState } from 'react';

interface NotificationContextType {
  isNotificationOpen: boolean;
  setIsNotificationOpen: (open: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

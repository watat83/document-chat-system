'use client';

import { useMounted } from '@/hooks/use-mounted';
import React, { createContext, useContext, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ToastNotification, type ToastProps } from '@/components/ui/toast';

export interface NotificationOptions {
  id?: string;
  title: string;
  message?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
}

interface Notification extends NotificationOptions {
  id: string;
  timestamp: number;
}

interface NotificationContextType {
  notifications: Notification[];
  notify: (options: NotificationOptions) => string;
  success: (title: string, message?: string, options?: Partial<NotificationOptions>) => string;
  error: (title: string, message?: string, options?: Partial<NotificationOptions>) => string;
  warning: (title: string, message?: string, options?: Partial<NotificationOptions>) => string;
  info: (title: string, message?: string, options?: Partial<NotificationOptions>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const DEFAULT_DURATION = 5000; // 5 seconds
const MAX_NOTIFICATIONS = 5;
const DUPLICATE_THRESHOLD = 1000; // 1 second

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const mounted = useMounted();
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    
    // Cleanup function to clear all timeouts on unmount
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const generateId = useCallback(() => {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }, []);

  const dismiss = useCallback((id: string) => {
    // Clear any existing timeout for this notification
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
    
    setNotifications([]);
  }, []);

  const notify = useCallback((options: NotificationOptions): string => {
    const id = options.id || generateId();
    const timestamp = Date.now();

    const notification: Notification = {
      ...options,
      id,
      timestamp,
      duration: options.duration ?? DEFAULT_DURATION,
    };

    setNotifications(prev => {
      // Check for duplicate notifications (same title and message within threshold)
      const duplicateExists = prev.some(existing => 
        existing.title === notification.title && 
        existing.message === notification.message &&
        (timestamp - existing.timestamp) < DUPLICATE_THRESHOLD
      );
      
      if (duplicateExists) {
        return prev;
      }
      
      // Remove any existing notification with the same ID
      const filtered = prev.filter(n => n.id !== id);
      
      // Add new notification to the beginning
      const updated = [notification, ...filtered];
      
      // Limit to MAX_NOTIFICATIONS
      return updated.slice(0, MAX_NOTIFICATIONS);
    });

    // Auto-dismiss if not persistent - use a ref to avoid dependency issues
    if (!options.persistent && notification.duration > 0) {
      const timeoutId = setTimeout(() => {
        dismiss(id);
      }, notification.duration);
      
      // Store timeout for cleanup
      timeoutsRef.current.set(id, timeoutId);
    }

    return id;
  }, [generateId, dismiss]);

  const success = useCallback((title: string, message?: string, options?: Partial<NotificationOptions>) => {
    return notify({
      title,
      message,
      type: 'success',
      ...options,
    });
  }, [notify]);

  const error = useCallback((title: string, message?: string, options?: Partial<NotificationOptions>) => {
    return notify({
      title,
      message,
      type: 'error',
      duration: options?.persistent ? 0 : 8000, // Longer duration for errors
      ...options,
    });
  }, [notify]);

  const warning = useCallback((title: string, message?: string, options?: Partial<NotificationOptions>) => {
    return notify({
      title,
      message,
      type: 'warning',
      duration: 7000, // Longer duration for warnings
      ...options,
    });
  }, [notify]);

  const info = useCallback((title: string, message?: string, options?: Partial<NotificationOptions>) => {
    return notify({
      title,
      message,
      type: 'info',
      ...options,
    });
  }, [notify]);

  const contextValue: NotificationContextType = useMemo(() => ({
    notifications,
    notify,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  }), [notifications, notify, success, error, warning, info, dismiss, dismissAll]);

  if (!mounted) {
    return (
      <NotificationContext.Provider value={contextValue}>
        {children}
      </NotificationContext.Provider>
    );
  }

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {mounted && createPortal(
        <NotificationContainer notifications={notifications} onDismiss={dismiss} />,
        document.body
      )}
    </NotificationContext.Provider>
  );
}

interface NotificationContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

function NotificationContainer({ notifications, onDismiss }: NotificationContainerProps) {
  if (notifications.length === 0) return null;

  return (
    <div 
      className="fixed top-4 right-4 z-[100000] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      style={{ zIndex: 100000 }}
      role="region" 
      aria-label="Notifications" 
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto animate-in slide-in-from-right-full duration-300"
        >
          <ToastNotification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => onDismiss(notification.id)}
          />
        </div>
      ))}
    </div>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// Convenience hook for quick notifications
export function useNotify() {
  const { success, error, warning, info } = useNotifications();
  
  return useMemo(() => ({
    success,
    error,
    warning,
    info,
  }), [success, error, warning, info]);
}
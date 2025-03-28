'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { getNotifications, markAllNotificationsAsRead,markNotificationAsRead } from '@/app/actions/notifications';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';

// Notification type from the database
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  created_at: Date;
}

// Context type
type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

// Create the context
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Provider component
export function NotificationProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const profileUuid = currentProfile?.uuid || '';
  
  // Get unread count
  const unreadCount = notifications.filter(n => !n.read).length;
  
  // Load notifications
  const refreshNotifications = async () => {
    if (!profileUuid) return;
    
    try {
      const result = await getNotifications(profileUuid);
      if (result.success) {
        setNotifications(result.notifications || []);
      } else {
        console.error('Failed to load notifications:', result.error);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };
  
  // Mark as read
  const markAsRead = async (id: string) => {
    if (!profileUuid) return;
    
    try {
      const result = await markNotificationAsRead(id, profileUuid);
      if (result.success) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };
  
  // Mark all as read
  const markAllAsRead = async () => {
    if (!profileUuid || unreadCount === 0) return;
    
    try {
      const result = await markAllNotificationsAsRead(profileUuid);
      if (result.success) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => ({ ...n, read: true }))
        );
        toast({
          title: 'Success',
          description: 'All notifications marked as read',
        });
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark all notifications as read',
      });
    }
  };
  
  // Load notifications on profile change
  useEffect(() => {
    refreshNotifications();
    
    // Poll for new notifications every minute
    const interval = setInterval(refreshNotifications, 60000);
    return () => clearInterval(interval);
  }, [profileUuid]);
  
  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      refreshNotifications,
      markAsRead,
      markAllAsRead
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

// Helper hook
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}; 
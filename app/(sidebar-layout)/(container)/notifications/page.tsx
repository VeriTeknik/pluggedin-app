'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi, ja, nl, tr, zhCN } from 'date-fns/locale';
import { Bell, Check, CheckSquare, Circle, Square, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { 
  deleteAllNotifications, 
  deleteNotification, 
  markNotificationAsRead,
  toggleNotificationCompleted
} from '@/app/actions/notifications';
import { useNotifications } from '@/components/providers/notification-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent,TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const { t, i18n } = useTranslation('notifications');
  const profileUuid = currentProfile?.uuid || '';
  const { notifications, refreshNotifications, unreadCount, markAllAsRead } =
    useNotifications();
  const [activeTab, setActiveTab] = useState('all');
  
  // Get date locale based on current language
  const getDateLocale = () => {
    switch (i18n.language) {
      case 'tr': return tr;
      case 'nl': return nl;
      case 'zh': return zhCN;
      case 'ja': return ja;
      case 'hi': return hi;
      default: return enUS;
    }
  };

  // Function to get badge color based on notification type
  const getBadgeVariant = (type: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (type.toUpperCase()) {
      case 'SUCCESS':
        return 'default';
      case 'WARNING':
        return 'outline';
      case 'ALERT':
        return 'destructive';
      case 'INFO':
        return 'secondary';
      case 'CUSTOM':
        return 'outline'; // Use outline for custom with yellow styling
      default:
        return 'outline';
    }
  };

  // Function to get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'CUSTOM':
        return <Circle className="h-4 w-4 mr-2 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Handle mark as read
  const handleMarkAsRead = async (id: string) => {
    if (!profileUuid) {
      return;
    }

    try {
      await markNotificationAsRead(id, profileUuid);
      refreshNotifications();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('notifications.toast.markReadError'),
        variant: 'destructive',
      });
    }
  };

  // Handle delete notification
  const handleDelete = async (id: string) => {
    if (!profileUuid) {
      return;
    }

    try {
      await deleteNotification(id, profileUuid);
      toast({
        title: t('common.success'),
        description: t('notifications.toast.deleteSuccess'),
      });
      refreshNotifications();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('notifications.toast.deleteError'),
        variant: 'destructive',
      });
    }
  };

  // Handle delete all notifications
  const handleDeleteAll = async () => {
    if (!profileUuid) {
      return;
    }

    try {
      await deleteAllNotifications(profileUuid);
      toast({
        title: t('common.success'),
        description: t('notifications.toast.deleteAllSuccess'),
      });
      refreshNotifications();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('notifications.toast.deleteAllError'),
        variant: 'destructive',
      });
    }
  };

  // Handle toggle completed for custom notifications
  const handleToggleCompleted = async (id: string) => {
    if (!profileUuid) {
      return;
    }

    try {
      await toggleNotificationCompleted(id, profileUuid);
      refreshNotifications();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('notifications.toast.toggleCompleteError'),
        variant: 'destructive',
      });
    }
  };

  // Filter notifications based on active tab
  const filteredNotifications = notifications.filter((notification) => {
    if (activeTab === 'all') {
      return true;
    }
    if (activeTab === 'unread') {
      return !notification.read;
    }
    return notification.type.toUpperCase() === activeTab.toUpperCase();
  });

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{t('notifications.title')}</CardTitle>
            <CardDescription>
              {t('notifications.description')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={() => markAllAsRead()}>
                <Check className="mr-2 h-4 w-4" />
                {t('notifications.actions.markAllAsRead')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('notifications.actions.actions')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDeleteAll}
                >
                  {t('notifications.actions.deleteAll')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">
                {t('notifications.tabs.all')}
                <Badge className="ml-2" variant="secondary">
                  {notifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unread">
                {t('notifications.tabs.unread')}
                <Badge className="ml-2" variant="secondary">
                  {unreadCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ALERT">{t('notifications.tabs.alerts')}</TabsTrigger>
              <TabsTrigger value="INFO">{t('notifications.tabs.info')}</TabsTrigger>
              <TabsTrigger value="SUCCESS">{t('notifications.tabs.success')}</TabsTrigger>
              <TabsTrigger value="CUSTOM">{t('notifications.tabs.notes')}</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">
                    {t('notifications.empty.title')}
                  </h3>
                  <p className="text-muted-foreground max-w-sm mt-1">
                    {t('notifications.empty.description')}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-20rem)]">
                  <div className="space-y-2">
                    {filteredNotifications.map((notification) => (
                      <Card
                        key={notification.id}
                        className={`overflow-hidden ${
                          !notification.read ? 'border-primary/50' : ''
                        }`}
                      >
                        <CardContent className="p-0">
                          <div className="flex">
                            <div
                              className={`w-1 ${
                                notification.type === 'SUCCESS'
                                  ? 'bg-green-500'
                                  : notification.type === 'WARNING'
                                  ? 'bg-amber-500'
                                  : notification.type === 'ALERT'
                                  ? 'bg-red-500'
                                  : notification.type === 'INFO'
                                  ? 'bg-blue-500'
                                  : notification.type === 'CUSTOM'
                                  ? 'bg-yellow-500'
                                  : 'bg-muted-foreground'
                              }`}
                            />
                            <div className="flex-1 p-4">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center">
                                  {notification.type === 'CUSTOM' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-0 h-auto mr-2"
                                      onClick={() => handleToggleCompleted(notification.id)}
                                    >
                                      {notification.completed ? (
                                        <CheckSquare className="h-5 w-5" />
                                      ) : (
                                        <Square className="h-5 w-5" />
                                      )}
                                    </Button>
                                  )}
                                  {getNotificationIcon(notification.type)}
                                  <h3 className={`font-medium text-base ${notification.completed ? 'line-through opacity-60' : ''}`}>
                                    {notification.title}
                                  </h3>
                                  {notification.type !== 'CUSTOM' && (
                                    <Badge
                                      variant={getBadgeVariant(
                                        notification.type
                                      )}
                                      className="ml-2"
                                    >
                                      {notification.type}
                                    </Badge>
                                  )}
                                  {notification.type === 'CUSTOM' && notification.severity && (
                                    <Badge
                                      variant={getBadgeVariant(notification.severity)}
                                      className="ml-2"
                                    >
                                      {notification.severity}
                                    </Badge>
                                  )}
                                  {!notification.read && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-2"
                                    >
                                      {t('status.unread')}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(
                                    new Date(notification.created_at),
                                    {
                                      addSuffix: true,
                                      locale: getDateLocale(),
                                    }
                                  )}
                                </span>
                              </div>
                              <p className={`text-muted-foreground ${notification.completed ? 'line-through opacity-60' : ''}`}>
                                {notification.message}
                              </p>
                              <div className="flex justify-between items-center mt-3">
                                {notification.link ? (
                                  <Link
                                    href={notification.link}
                                    className="text-sm text-primary hover:underline"
                                  >
                                    {t('actions.viewDetails')}
                                  </Link>
                                ) : (
                                  <div />
                                )}
                                <div className="flex gap-2">
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleMarkAsRead(notification.id)
                                      }
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      {t('actions.markAsRead')}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() =>
                                      handleDelete(notification.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    {t('actions.delete')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

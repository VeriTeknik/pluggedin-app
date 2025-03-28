'use client';

import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Bell, Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { 
  deleteAllNotifications, 
  deleteNotification, 
  markNotificationAsRead 
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
  const profileUuid = currentProfile?.uuid || '';
  const { notifications, refreshNotifications, unreadCount, markAllAsRead } =
    useNotifications();
  const [activeTab, setActiveTab] = useState('all');

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
      default:
        return 'outline';
    }
  };

  // Handle mark as read
  const handleMarkAsRead = async (id: string) => {
    if (!profileUuid) return;

    try {
      await markNotificationAsRead(id, profileUuid);
      refreshNotifications();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to mark notification as read',
        variant: 'destructive',
      });
    }
  };

  // Handle delete notification
  const handleDelete = async (id: string) => {
    if (!profileUuid) return;

    try {
      await deleteNotification(id, profileUuid);
      toast({
        title: 'Success',
        description: 'Notification deleted',
      });
      refreshNotifications();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete notification',
        variant: 'destructive',
      });
    }
  };

  // Handle delete all notifications
  const handleDeleteAll = async () => {
    if (!profileUuid) return;

    try {
      await deleteAllNotifications(profileUuid);
      toast({
        title: 'Success',
        description: 'All notifications deleted',
      });
      refreshNotifications();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete all notifications',
        variant: 'destructive',
      });
    }
  };

  // Filter notifications based on active tab
  const filteredNotifications = notifications.filter((notification) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !notification.read;
    return notification.type.toUpperCase() === activeTab.toUpperCase();
  });

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Bildirimler</CardTitle>
            <CardDescription>
              Sistemle ilgili tüm bildirimleri burada görebilirsiniz
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={() => markAllAsRead()}>
                <Check className="mr-2 h-4 w-4" />
                Tümünü Okundu İşaretle
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>İşlemler</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDeleteAll}
                >
                  Tüm Bildirimleri Sil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">
                Tümü
                <Badge className="ml-2" variant="secondary">
                  {notifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unread">
                Okunmamış
                <Badge className="ml-2" variant="secondary">
                  {unreadCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ALERT">Uyarılar</TabsTrigger>
              <TabsTrigger value="INFO">Bilgiler</TabsTrigger>
              <TabsTrigger value="SUCCESS">Başarılar</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">
                    Bildirim Bulunmuyor
                  </h3>
                  <p className="text-muted-foreground max-w-sm mt-1">
                    Bu kategoride hiç bildiriminiz bulunmuyor.
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
                                  : 'bg-muted-foreground'
                              }`}
                            />
                            <div className="flex-1 p-4">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center">
                                  <h3 className="font-medium text-base">
                                    {notification.title}
                                  </h3>
                                  <Badge
                                    variant={getBadgeVariant(
                                      notification.type
                                    )}
                                    className="ml-2"
                                  >
                                    {notification.type}
                                  </Badge>
                                  {!notification.read && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-2"
                                    >
                                      Okunmadı
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(
                                    new Date(notification.created_at),
                                    {
                                      addSuffix: true,
                                      locale: tr,
                                    }
                                  )}
                                </span>
                              </div>
                              <p className="text-muted-foreground">
                                {notification.message}
                              </p>
                              <div className="flex justify-between items-center mt-3">
                                {notification.link ? (
                                  <Link
                                    href={notification.link}
                                    className="text-sm text-primary hover:underline"
                                  >
                                    Ayrıntıları görüntüle
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
                                      Okundu
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
                                    Sil
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
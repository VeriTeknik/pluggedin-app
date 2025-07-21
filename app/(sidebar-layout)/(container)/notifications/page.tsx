'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi, ja, nl, tr, zhCN } from 'date-fns/locale';
import { 
  Bell, 
  BellRing,
  Check, 
  CheckSquare, 
  Circle, 
  Filter,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  RefreshCw, 
  Search,
  Square, 
  Star,
  Trash2,
  Users 
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NotificationMetadataDisplay } from '@/components/ui/notification-metadata';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const { t, i18n } = useTranslation('notifications');
  const profileUuid = currentProfile?.uuid || '';
  const { notifications, refreshNotifications, unreadCount, markAllAsRead } =
    useNotifications();

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
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
        return 'outline';
      default:
        return 'outline';
    }
  };

  // Function to get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SUCCESS':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'WARNING':
        return <Bell className="h-4 w-4 text-amber-500" />;
      case 'ALERT':
        return <BellRing className="h-4 w-4 text-red-500" />;
      case 'INFO':
        return <Mail className="h-4 w-4 text-blue-500" />;
      case 'CUSTOM':
        return <Circle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Handle mark as read
  const handleMarkAsRead = async (id: string) => {
    if (!profileUuid) return;

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
    if (!profileUuid) return;

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
    if (!profileUuid) return;

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
    if (!profileUuid) return;

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

  // Get category counts
  const categoryCounts = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter(n => !n.read).length,
      success: notifications.filter(n => n.type && n.type.toUpperCase() === 'SUCCESS').length,
      warning: notifications.filter(n => n.type && n.type.toUpperCase() === 'WARNING').length,
      alert: notifications.filter(n => n.type && n.type.toUpperCase() === 'ALERT').length,
      info: notifications.filter(n => n.type && n.type.toUpperCase() === 'INFO').length,
      custom: notifications.filter(n => n.type && n.type.toUpperCase() === 'CUSTOM').length,
    };
  }, [notifications]);

  // Filter and sort notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    // Apply category filter
    if (selectedCategory === 'unread') {
      filtered = filtered.filter(n => !n.read);
    } else if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => n.type.toLowerCase() === selectedCategory);
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(n => n.severity === severityFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(search) || 
        n.message.toLowerCase().includes(search)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return sorted;
  }, [notifications, selectedCategory, severityFilter, searchTerm, sortOrder]);

  // Sidebar component
  const Sidebar = ({ className = "" }: { className?: string }) => (
    <div className={cn("w-64 border-r bg-muted/30", className)}>
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          {t('notifications.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('notifications.description')}
        </p>
      </div>
      
      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-2 space-y-1">
          {[
            { key: 'all', label: t('notifications.tabs.all'), icon: Inbox, count: categoryCounts.all },
            { key: 'unread', label: t('notifications.tabs.unread'), icon: Mail, count: categoryCounts.unread },
            { key: 'success', label: t('notifications.tabs.success'), icon: Check, count: categoryCounts.success },
            { key: 'info', label: t('notifications.tabs.info'), icon: Mail, count: categoryCounts.info },
            { key: 'warning', label: 'WARNING', icon: Bell, count: categoryCounts.warning },
            { key: 'alert', label: t('notifications.tabs.alerts'), icon: BellRing, count: categoryCounts.alert },
            { key: 'custom', label: t('notifications.tabs.notes'), icon: Star, count: categoryCounts.custom },
          ].map((item) => (
            <Button
              key={item.key}
              variant={selectedCategory === item.key ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setSelectedCategory(item.key)}
            >
              <item.icon className="h-4 w-4 mr-3" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {item.count}
                </Badge>
              )}
            </Button>
          ))}
        </div>
        
        <Separator className="my-4" />
      </ScrollArea>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className=" py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Users className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-64">
                  <Sidebar />
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
                  <p className="text-sm text-muted-foreground">
                    {unreadCount} {t('notifications.tabs.unread').toLowerCase()}, {notifications.length} {t('notifications.tabs.all').toLowerCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={refreshNotifications}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  <MailOpen className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{t('notifications.actions.markAllAsRead')}</span>
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t('notifications.actions.actions')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDeleteAll} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('notifications.actions.deleteAll')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('notifications.search.placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background/50"
              />
            </div>

            <div className="flex gap-2">
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('notifications.filter.severity')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notifications.filter.allSeverities')}</SelectItem>
                  <SelectItem value="INFO">INFO</SelectItem>
                  <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                  <SelectItem value="WARNING">WARNING</SelectItem>
                  <SelectItem value="ALERT">ALERT</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('notifications.sort.newest')}</SelectItem>
                  <SelectItem value="oldest">{t('notifications.sort.oldest')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <Sidebar className="hidden lg:block" />

        {/* Main Content */}
        <div className="flex-1">
          {/* Toolbar */}
          <div className="border-b px-6 py-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="font-semibold capitalize">
                  {selectedCategory === 'all' ? t('notifications.tabs.all') : 
                   selectedCategory === 'unread' ? t('notifications.tabs.unread') :
                   selectedCategory === 'success' ? t('notifications.tabs.success') :
                   selectedCategory === 'info' ? t('notifications.tabs.info') :
                   selectedCategory === 'alert' ? t('notifications.tabs.alerts') :
                   selectedCategory === 'custom' ? t('notifications.tabs.notes') :
                   selectedCategory.toUpperCase()}
                </h2>
                <Badge variant="secondary">
                  {filteredNotifications.length}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{t('notifications.filter.severity')}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Notifications List */}
          <ScrollArea className="h-[calc(100vh-200px)]">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t('notifications.empty.title')}</h3>
                <p className="text-muted-foreground max-w-sm">
                  {t('notifications.empty.description')}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-4 hover:bg-muted/30 transition-colors cursor-pointer border-l-4",
                      !notification.read 
                        ? "bg-primary/5 border-l-primary" 
                        : "border-l-transparent",
                      notification.completed && "opacity-60"
                    )}
                    onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {notification.type === 'CUSTOM' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="p-0 h-auto mr-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCompleted(notification.id);
                                }}
                              >
                                {notification.completed ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </Button>
                            )}

                            <h3 className={cn(
                              "font-medium",
                              !notification.read && "font-semibold",
                              notification.completed && "line-through"
                            )}>
                              {notification.title}
                            </h3>
                            
                            <Badge variant={getBadgeVariant(notification.type)} className="text-xs">
                              {notification.type}
                            </Badge>

                            {!notification.read && (
                              <div className="h-2 w-2 bg-primary rounded-full" />
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(notification.created_at), {
                                addSuffix: true,
                                locale: getDateLocale(),
                              })}
                            </span>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!notification.read && (
                                  <DropdownMenuItem onClick={() => handleMarkAsRead(notification.id)}>
                                    <Check className="h-4 w-4 mr-2" />
                                    {t('notifications.actions.markAsRead')}
                                  </DropdownMenuItem>
                                )}
                                {notification.type === 'CUSTOM' && (
                                  <DropdownMenuItem onClick={() => handleToggleCompleted(notification.id)}>
                                    {notification.completed ? (
                                      <>
                                        <Square className="h-4 w-4 mr-2" />
                                        Mark incomplete
                                      </>
                                    ) : (
                                      <>
                                        <CheckSquare className="h-4 w-4 mr-2" />
                                        Mark complete
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(notification.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {t('notifications.actions.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <div className={cn(
                          "text-sm text-muted-foreground notification-markdown-page",
                          notification.completed && "line-through"
                        )}>
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                              li: ({ children }) => <li className="mb-1">{children}</li>,
                              a: ({ href, children }) => (
                                <a 
                                  href={href} 
                                  className="text-primary hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                              code: ({ children }) => <code className="px-1 py-0.5 bg-muted rounded text-xs">{children}</code>,
                              pre: ({ children }) => <pre className="p-2 bg-muted rounded text-xs overflow-x-auto mb-2">{children}</pre>,
                            }}
                          >
                            {notification.message}
                          </ReactMarkdown>
                        </div>

                        <NotificationMetadataDisplay metadata={notification.metadata} />

                        {notification.link && (
                          <div className="mt-2">
                            <Link
                              href={notification.link}
                              className="text-xs text-primary hover:underline"
                            >
                              {t('actions.viewDetails')}
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

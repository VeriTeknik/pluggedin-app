'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi, ja, nl, tr, zhCN } from 'date-fns/locale';
import { Bell, Check, CheckSquare, Circle, RefreshCw, Square, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  
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

  // Filter and sort notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    // Apply tab filter
    if (activeTab === 'unread') {
      filtered = filtered.filter(n => !n.read);
    } else if (activeTab !== 'all') {
      filtered = filtered.filter(n => n.type.toUpperCase() === activeTab.toUpperCase());
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
  }, [notifications, activeTab, severityFilter, searchTerm, sortOrder]);

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
            <Button variant="ghost" size="icon" onClick={() => refreshNotifications()}>
              <RefreshCw className="h-5 w-5" />
            </Button>
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
          {/* Filter and Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <Input
              placeholder={t('notifications.search.placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sm:w-64"
            />
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="sm:w-48">
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
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t('notifications.sort.newest')}</SelectItem>
                <SelectItem value="oldest">{t('notifications.sort.oldest')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                <ScrollArea className="h-[var(--notification-content)]">
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
                                      {t('notifications.status.unread')}
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
                              <div className={`text-muted-foreground ${notification.completed ? 'line-through opacity-60' : ''} notification-markdown-page`}>
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
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
                                    code: ({ children }) => <code className="px-1.5 py-0.5 bg-muted rounded text-sm">{children}</code>,
                                    pre: ({ children }) => <pre className="p-3 bg-muted rounded text-sm overflow-x-auto mb-2">{children}</pre>,
                                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                    em: ({ children }) => <em className="italic">{children}</em>,
                                    h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-2">
                                        {children}
                                      </blockquote>
                                    ),
                                    hr: () => <hr className="my-4 border-muted-foreground/30" />,
                                    table: ({ children }) => (
                                      <div className="overflow-x-auto mb-2">
                                        <table className="min-w-full divide-y divide-border">{children}</table>
                                      </div>
                                    ),
                                    th: ({ children }) => (
                                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider bg-muted">
                                        {children}
                                      </th>
                                    ),
                                    td: ({ children }) => (
                                      <td className="px-3 py-2 text-sm border-b">{children}</td>
                                    ),
                                  }}
                                >
                                  {notification.message}
                                </ReactMarkdown>
                              </div>
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
                                      {t('notifications.actions.markAsRead')}
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
                                    {t('notifications.actions.delete')}
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

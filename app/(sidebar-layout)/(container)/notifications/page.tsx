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
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
    <div className="w-full">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 pb-4 sm:pb-6">
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl">{t('notifications.title')}</CardTitle>
            <CardDescription className="text-sm">
              {t('notifications.description')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => refreshNotifications()}>
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="sm:hidden ml-1">Refresh</span>
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
                <Check className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">{t('notifications.actions.markAllAsRead')}</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="sm:hidden ml-1">Delete</span>
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
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Filter and Sort Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Input
              placeholder={t('notifications.search.placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full">
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
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t('notifications.sort.newest')}</SelectItem>
                <SelectItem value="oldest">{t('notifications.sort.oldest')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-4">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.all')}</span>
                <span className="sm:hidden">All</span>
                <Badge className="ml-1 text-xs" variant="secondary">
                  {notifications.length}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab('unread')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'unread'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.unread')}</span>
                <span className="sm:hidden">New</span>
                <Badge className="ml-1 text-xs" variant="secondary">
                  {unreadCount}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab('ALERT')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'ALERT'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.alerts')}</span>
                <span className="sm:hidden">Alerts</span>
              </button>
              <button
                onClick={() => setActiveTab('INFO')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'INFO'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.info')}</span>
                <span className="sm:hidden">Info</span>
              </button>
              <button
                onClick={() => setActiveTab('SUCCESS')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'SUCCESS'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.success')}</span>
                <span className="sm:hidden">Success</span>
              </button>
              <button
                onClick={() => setActiveTab('CUSTOM')}
                className={`flex items-center justify-center px-2 py-2 text-xs sm:text-sm rounded-md transition-colors ${
                  activeTab === 'CUSTOM'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="hidden sm:inline">{t('notifications.tabs.notes')}</span>
                <span className="sm:hidden">Notes</span>
              </button>
            </div>

            <TabsContent value={activeTab}>
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                  <Bell className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium">
                    {t('notifications.empty.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1 px-4">
                    {t('notifications.empty.description')}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[50vh] sm:h-[60vh]">
                  <div className="space-y-3">
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
                            <div className="flex-1 p-3 sm:p-4">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-2 space-y-2 sm:space-y-0">
                                <div className="flex items-start space-x-2">
                                  {notification.type === 'CUSTOM' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-0 h-auto shrink-0"
                                      onClick={() => handleToggleCompleted(notification.id)}
                                    >
                                      {notification.completed ? (
                                        <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                                      ) : (
                                        <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                                      )}
                                    </Button>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start flex-wrap gap-1 sm:gap-2">
                                      {getNotificationIcon(notification.type)}
                                      <h3 className={`font-medium text-sm sm:text-base break-words ${notification.completed ? 'line-through opacity-60' : ''}`}>
                                        {notification.title}
                                      </h3>
                                      {notification.type !== 'CUSTOM' && (
                                        <Badge
                                          variant={getBadgeVariant(
                                            notification.type
                                          )}
                                          className="text-xs"
                                        >
                                          {notification.type}
                                        </Badge>
                                      )}
                                      {notification.type === 'CUSTOM' && notification.severity && (
                                        <Badge
                                          variant={getBadgeVariant(notification.severity)}
                                          className="text-xs"
                                        >
                                          {notification.severity}
                                        </Badge>
                                      )}
                                      {!notification.read && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {t('notifications.status.unread')}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0 sm:ml-4">
                                  {formatDistanceToNow(
                                    new Date(notification.created_at),
                                    {
                                      addSuffix: true,
                                      locale: getDateLocale(),
                                    }
                                  )}
                                </span>
                              </div>
                              <div className={`text-sm text-muted-foreground mb-3 ${notification.completed ? 'line-through opacity-60' : ''} notification-markdown-page`}>
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
                                        className="text-primary hover:underline break-words"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {children}
                                      </a>
                                    ),
                                    code: ({ children }) => <code className="px-1.5 py-0.5 bg-muted rounded text-xs sm:text-sm">{children}</code>,
                                    pre: ({ children }) => <pre className="p-2 sm:p-3 bg-muted rounded text-xs sm:text-sm overflow-x-auto mb-2">{children}</pre>,
                                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                    em: ({ children }) => <em className="italic">{children}</em>,
                                    h1: ({ children }) => <h1 className="text-base sm:text-lg font-bold mb-2 mt-3 sm:mt-4 first:mt-0">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-sm sm:text-base font-bold mb-2 mt-2 sm:mt-3 first:mt-0">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-4 border-muted-foreground/30 pl-3 sm:pl-4 italic my-2">
                                        {children}
                                      </blockquote>
                                    ),
                                    hr: () => <hr className="my-3 sm:my-4 border-muted-foreground/30" />,
                                    table: ({ children }) => (
                                      <div className="overflow-x-auto mb-2 border rounded">
                                        <table className="min-w-full divide-y divide-border text-xs sm:text-sm">{children}</table>
                                      </div>
                                    ),
                                    th: ({ children }) => (
                                      <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-xs font-medium uppercase tracking-wider bg-muted">
                                        {children}
                                      </th>
                                    ),
                                    td: ({ children }) => (
                                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b break-words">{children}</td>
                                    ),
                                  }}
                                >
                                  {notification.message}
                                </ReactMarkdown>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
                                {notification.link ? (
                                  <Link
                                    href={notification.link}
                                    className="text-xs sm:text-sm text-primary hover:underline break-words"
                                  >
                                    {t('actions.viewDetails')}
                                  </Link>
                                ) : (
                                  <div />
                                )}
                                <div className="flex flex-wrap gap-2">
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleMarkAsRead(notification.id)
                                      }
                                      className="text-xs sm:text-sm"
                                    >
                                      <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                      <span className="hidden sm:inline">{t('notifications.actions.markAsRead')}</span>
                                      <span className="sm:hidden">Read</span>
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive text-xs sm:text-sm"
                                    onClick={() =>
                                      handleDelete(notification.id)
                                    }
                                  >
                                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                    <span className="hidden sm:inline">{t('notifications.actions.delete')}</span>
                                    <span className="sm:hidden">Delete</span>
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

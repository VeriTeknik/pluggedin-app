'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi, ja, nl, tr, zhCN } from 'date-fns/locale';
import { 
  Archive, 
  Bell, 
  Check, 
  CheckCircle2, 
  CheckSquare, 
  Circle, 
  Clock, 
  Mail, 
  MailOpen, 
  Menu,
  MoreHorizontal, 
  RefreshCw, 
  Search, 
  Square, 
  Star, 
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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
  const getNotificationIcon = (type: string, read: boolean) => {
    const iconClass = "h-4 w-4";
    switch (type.toUpperCase()) {
      case 'SUCCESS':
        return <CheckCircle2 className={`${iconClass} text-green-500`} />;
      case 'WARNING':
        return <Clock className={`${iconClass} text-amber-500`} />;
      case 'ALERT':
        return <Bell className={`${iconClass} text-red-500`} />;
      case 'INFO':
        return <Mail className={`${iconClass} text-blue-500`} />;
      case 'CUSTOM':
        return <Star className={`${iconClass} text-yellow-500`} />;
      default:
        return read ? <MailOpen className={`${iconClass} text-muted-foreground`} /> : <Mail className={`${iconClass} text-primary`} />;
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

  // Handle select notification
  const handleSelectNotification = (id: string) => {
    setSelectedNotifications(prev => 
      prev.includes(id) 
        ? prev.filter(nId => nId !== id)
        : [...prev, id]
    );
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
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

  // Sidebar Navigation Component
  const SidebarNav = ({ className = "" }: { className?: string }) => (
    <div className={`space-y-1 ${className}`}>
      <button
        onClick={() => {
          setActiveTab('all');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Mail className="h-4 w-4" />
        <span className="flex-1 text-left">All</span>
        <Badge variant="secondary" className="text-xs">
          {notifications.length}
        </Badge>
      </button>
      
      <button
        onClick={() => {
          setActiveTab('unread');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'unread'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Circle className="h-4 w-4" />
        <span className="flex-1 text-left">Unread</span>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {unreadCount}
          </Badge>
        )}
      </button>
      
      <Separator className="my-2" />
      
      <button
        onClick={() => {
          setActiveTab('ALERT');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'ALERT'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Bell className="h-4 w-4 text-red-500" />
        <span className="flex-1 text-left">Alerts</span>
      </button>
      
      <button
        onClick={() => {
          setActiveTab('INFO');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'INFO'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Mail className="h-4 w-4 text-blue-500" />
        <span className="flex-1 text-left">Info</span>
      </button>
      
      <button
        onClick={() => {
          setActiveTab('SUCCESS');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'SUCCESS'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="flex-1 text-left">Success</span>
      </button>
      
      <button
        onClick={() => {
          setActiveTab('CUSTOM');
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
          activeTab === 'CUSTOM'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Star className="h-4 w-4 text-yellow-500" />
        <span className="flex-1 text-left">Notes</span>
      </button>
    </div>
  );

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      {/* Gmail-style Header */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Categories
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-5rem)]">
                  <div className="p-4">
                    <SidebarNav />
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Mail className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold">{t('notifications.title')}</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">
                {notifications.length} {t('notifications.description')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refreshNotifications()}>
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Refresh</span>
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">{t('notifications.actions.markAllAsRead')}</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
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
      </div>

      {/* Gmail-style Toolbar */}
      <div className="border-b bg-muted/30 px-4 sm:px-6 py-2 sm:py-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('notifications.search.placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full sm:w-32 bg-background">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="ALERT">Alert</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={sortOrder} onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}>
              <SelectTrigger className="w-full sm:w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Gmail-style Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex w-60 border-r bg-card p-2 overflow-y-auto">
          <SidebarNav />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value={activeTab} className="m-0 flex-1 overflow-hidden">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Mail className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {t('notifications.empty.title')}
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    {t('notifications.empty.description')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Selection toolbar */}
                  {selectedNotifications.length > 0 && (
                    <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {selectedNotifications.length} selected
                      </span>
                      <Button variant="ghost" size="sm">
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  )}

                  {/* Notification List */}
                  <ScrollArea className="flex-1">
                    <div className="divide-y">
                    {filteredNotifications.map((notification) => (
                        <div
                        key={notification.id}
                          className={`group flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ${
                            !notification.read 
                              ? 'bg-blue-50/50 hover:bg-blue-50/80 border-l-4 border-l-blue-500' 
                              : 'hover:bg-muted/50'
                          } ${
                            selectedNotifications.includes(notification.id) 
                              ? 'bg-primary/10' 
                              : ''
                          }`}
                          onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={(e: React.MouseEvent) => {
                               e.stopPropagation();
                               handleSelectNotification(notification.id);
                             }}
                            className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {selectedNotifications.includes(notification.id) ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>

                          {/* Icon */}
                          <div className="mt-1">
                            {getNotificationIcon(notification.type, notification.read)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                  {notification.type === 'CUSTOM' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                    className="p-0 h-auto"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleCompleted(notification.id);
                                    }}
                                    >
                                      {notification.completed ? (
                                      <CheckSquare className="h-4 w-4 text-green-500" />
                                      ) : (
                                      <Square className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </Button>
                                  )}
                                <h3 className={`font-medium text-sm break-words ${
                                  !notification.read ? 'font-semibold' : 'font-normal'
                                } ${notification.completed ? 'line-through opacity-60' : ''}`}>
                                    {notification.title}
                                  </h3>
                                    <Badge
                                  variant={getBadgeVariant(notification.type)}
                                  className="text-xs shrink-0"
                                    >
                                      {notification.type}
                                    </Badge>
                                </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(notification.created_at), {
                                      addSuffix: true,
                                      locale: getDateLocale(),
                                })}
                                </span>
                              </div>
                            
                            <div className={`text-sm text-muted-foreground line-clamp-2 ${
                              notification.completed ? 'line-through opacity-60' : ''
                            }`}>
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                  p: ({ children }) => <span>{children}</span>,
                                  strong: ({ children }) => <strong>{children}</strong>,
                                  em: ({ children }) => <em>{children}</em>,
                                  code: ({ children }) => <code className="px-1 py-0.5 bg-muted rounded text-xs">{children}</code>,
                                }}
                              >
                                {notification.message.length > 150 
                                  ? notification.message.substring(0, 150) + '...'
                                  : notification.message
                                }
                                </ReactMarkdown>
                              </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkAsRead(notification.id);
                                  }}
                                  className="h-7 px-2 text-xs"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  Mark read
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(notification.id);
                                }}
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                                  </Button>
                              {notification.link && (
                                <Link
                                  href={notification.link}
                                  className="h-7 px-2 text-xs text-primary hover:underline flex items-center"
                                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                >
                                  View details
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                    ))}
                  </div>
                </ScrollArea>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

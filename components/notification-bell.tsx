'use client';

import { formatDistanceToNow } from 'date-fns';
import { enUS, hi,ja, nl, tr, zhCN } from 'date-fns/locale';
import { Bell, Circle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useNotifications } from '@/components/providers/notification-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { t, i18n } = useTranslation('notifications');
  const router = useRouter();
  
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
  
  // Function to get icon color based on notification type
  const getColorByType = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SUCCESS':
        return 'text-green-500';
      case 'WARNING':
        return 'text-amber-500';
      case 'ALERT':
        return 'text-red-500';
      case 'INFO':
        return 'text-blue-500';
      case 'CUSTOM':
        return 'text-yellow-500';
      default:
        return 'text-muted-foreground';
    }
  };
  
  // Function to get icon based on notification type
  const getIconByType = (type: string) => {
    switch (type.toUpperCase()) {
      case 'CUSTOM':
        return <Circle className="h-4 w-4 mr-2 text-yellow-500 shrink-0" />;
      default:
        return null;
    }
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold text-sm truncate flex-1 mr-2">{t('notifications.title')}</div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-xs shrink-0"
              onClick={() => markAllAsRead()}
            >
              <span className="hidden sm:inline">{t('notifications.actions.markAllAsRead')}</span>
              <span className="sm:hidden">Mark all</span>
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {t('notifications.empty.title')}
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem 
                key={notification.id}
                className={`p-3 focus:bg-accent border-b last:border-b-0 cursor-pointer ${
                  !notification.read ? 'bg-accent/20' : ''
                } ${notification.link ? 'hover:bg-accent/50' : ''}`}
                onClick={() => {
                  markAsRead(notification.id);
                  if (notification.link) {
                    router.push(notification.link);
                  } else {
                    router.push('/notifications');
                  }
                }}
              >
                <div className="flex flex-col gap-2 w-full min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1 min-w-0 flex-1">
                      {getIconByType(notification.type)}
                      <span className={`font-medium text-sm break-words ${getColorByType(notification.type)} leading-tight`}>
                        {notification.title}
                      </span>
                      {notification.link && (
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(notification.created_at), { 
                        addSuffix: true,
                        locale: getDateLocale() 
                      })}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground notification-markdown line-clamp-3">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0 break-words">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
                        li: ({ children }) => <li className="mb-0.5 break-words">{children}</li>,
                        a: ({ href, children }) => (
                          <a 
                            href={href} 
                            className="text-primary hover:underline break-all"
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        code: ({ children }) => <code className="px-1 py-0.5 bg-muted rounded text-xs break-all">{children}</code>,
                        pre: ({ children }) => <pre className="p-2 bg-muted rounded text-xs overflow-x-auto mb-1">{children}</pre>,
                        strong: ({ children }) => <strong className="font-semibold break-words">{children}</strong>,
                        em: ({ children }) => <em className="italic break-words">{children}</em>,
                        h1: ({ children }) => <h1 className="text-sm font-bold mb-1 break-words">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1 break-words">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 break-words">{children}</h3>,
                      }}
                    >
                      {notification.message.length > 150 
                        ? notification.message.substring(0, 150) + '...'
                        : notification.message
                      }
                    </ReactMarkdown>
                  </div>
                  
                  {!notification.read && (
                    <div className="flex justify-end">
                      <Badge variant="secondary" className="text-xs shrink-0">{t('notifications.status.unread')}</Badge>
                    </div>
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="p-2">
          <Link href="/notifications" className="block w-full">
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {}}>
              {t('notifications.actions.viewAll')}
            </Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

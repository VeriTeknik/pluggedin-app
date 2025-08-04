'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileEmbeddedChatProps {
  chatData: {
    chatUuid: string;
    chatName: string;
    welcomeMessage?: string | null;
    themeConfig?: any;
    position?: string;
    requireApiKey: boolean;
    user: {
      id: string;
      username: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
    project: {
      uuid: string;
      name: string;
    };
  };
  isOwner?: boolean;
}

export function ProfileEmbeddedChat({ chatData, isOwner = false }: ProfileEmbeddedChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Get the base URL for the iframe
  const getIframeUrl = () => {
    const baseUrl = window.location.origin;
    // No API key needed for public chats
    return `${baseUrl}/embed/chat/${chatData.chatUuid}`;
  };

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (isOwner) {
    // Don't show the floating widget for owners
    // The info card is handled by EmbeddedChatInfo component
    return null;
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            onClick={() => setIsOpen(true)}
            size="lg"
            className="rounded-full h-14 w-14 shadow-lg hover:scale-105 transition-transform"
          >
            <MessageSquare className="h-6 w-6" />
            <span className="sr-only">Chat with {chatData.user.name || chatData.user.username}</span>
          </Button>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-background border rounded-lg shadow-2xl transition-all duration-300",
            isFullscreen ? "inset-4" : isMinimized ? "bottom-6 right-6 w-80 h-20" : "bottom-6 right-6 w-96 h-[600px]",
            "flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-muted/50 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{chatData.chatName}</h3>
                <p className="text-xs text-muted-foreground">
                  by {chatData.user.name || chatData.user.username}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                <Minimize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3 w-3" />
                ) : (
                  <Maximize2 className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Chat Content */}
          {!isMinimized && (
            <div className="flex-1 relative">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-background">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading chat...</p>
                  </div>
                </div>
              )}
              <iframe
                src={getIframeUrl()}
                className="w-full h-full rounded-b-lg"
                frameBorder="0"
                title={`Chat with ${chatData.user.name || chatData.user.username}`}
                onLoad={() => setIframeLoaded(true)}
                allow="clipboard-write"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
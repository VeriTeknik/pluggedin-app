'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';

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
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  // Get the base URL for the iframe (SSR-safe)
  const getIframeUrl = () => {
    // Use relative URL to avoid SSR issues
    return `/embed/chat/${chatData.chatUuid}`;
  };

  // Handle iframe messages
  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      if (event.data?.type === 'chat:ready') {
        setIframeLoaded(true);
        // Hide welcome after a delay
        setTimeout(() => setShowWelcome(false), 1500);
      }
    };
    
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []);

  if (isOwner) {
    // Don't show the embedded widget for owners
    return null;
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in-50 duration-500">
      {/* Welcome Section with Gradient Background */}
      {showWelcome && (
        <div className={cn(
          "relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10 p-8 transition-all duration-700",
          !iframeLoaded && "animate-pulse"
        )}>
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-400/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/20 to-transparent rounded-full blur-2xl" />
          
          <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
              <h3 className="text-2xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                Meet {chatData.chatName}
              </h3>
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            
            {chatData.welcomeMessage && (
              <p className="text-muted-foreground max-w-md mx-auto mb-4 text-sm">
                "{chatData.welcomeMessage}"
              </p>
            )}
            
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Always ready</span>
              </div>
              <div className="flex items-center gap-1">
                <span>💡</span>
                <span>Super helpful</span>
              </div>
              <div className="flex items-center gap-1">
                <span>🔒</span>
                <span>Private & safe</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Chat Frame */}
      <div className="relative w-full group">
        {/* Gradient Border Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-300" />
        
        {/* Chat Container */}
        <div className="relative bg-background rounded-2xl shadow-xl overflow-hidden border border-border/50">
          {/* Loading State */}
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-10">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-purple-200 dark:border-purple-900" />
                <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waking up the assistant...
              </p>
            </div>
          )}
          
          {/* Iframe */}
          <iframe
            src={getIframeUrl()}
            className={cn(
              "w-full h-[600px] rounded-2xl transition-opacity duration-500",
              iframeLoaded ? "opacity-100" : "opacity-0"
            )}
            frameBorder="0"
            title={`Chat with ${chatData.chatName}`}
            onLoad={() => setIframeLoaded(true)}
            allow="clipboard-write"
          />
        </div>

        {/* Decorative Bottom Gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background via-background/50 to-transparent pointer-events-none rounded-b-2xl" />
      </div>

      {/* Fun Footer Message */}
      {iframeLoaded && !showWelcome && (
        <p className="text-center text-xs text-muted-foreground animate-in slide-in-from-bottom-2 duration-500">
          💬 {chatData.chatName} is powered by {chatData.user.name || chatData.user.username}'s knowledge
        </p>
      )}
    </div>
  );
}
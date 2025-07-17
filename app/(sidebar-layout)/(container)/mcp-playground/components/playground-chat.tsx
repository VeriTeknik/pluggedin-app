'use client';

import { useVirtualizer } from '@tanstack/react-virtual'; 
import { Loader2, Send, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react'; 
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getModelBadgeClass } from '@/lib/utils';

interface Message {
  role: string;
  content: string;
  debug?: string;
  timestamp?: Date;
  isPartial?: boolean;
  model?: string;
}

interface PlaygroundChatProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isSessionActive: boolean;
  isProcessing: boolean;
  isThinking: boolean;
  sendMessage: () => void;
  startSession: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  mcpServers?: {
    status: string;
  }[];
  llmConfig: {
    ragEnabled?: boolean;
  };
}

export function PlaygroundChat({
  messages,
  inputValue,
  setInputValue,
  isSessionActive,
  isProcessing,
  isThinking,
  sendMessage,
  startSession,
  messagesEndRef,
  mcpServers,
  llmConfig,
}: PlaygroundChatProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length && parentRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        try {
          rowVirtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
        } catch (error) {
          // Fallback to manual scroll if virtualizer fails
          if (parentRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
          }
        }
      }, 10);
    }
  }, [messages.length, rowVirtualizer]);

  return (
    <div className='flex flex-col h-full bg-background min-h-0'>

      {/* Chat Messages Area - Fixed height with proper scrolling */}
      <div ref={parentRef} className='flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 min-h-0'>
        <div 
          style={{ 
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%', 
            position: 'relative',
            minHeight: '100%',
            display: 'flex',
            alignItems: messages.length === 0 ? 'center' : 'flex-start'
          }}
        >
          {messages.length === 0 ? (
            <div className='w-full flex flex-col items-center justify-center text-center p-4 sm:p-8'>
              <div className='bg-muted/30 rounded-full p-4 sm:p-6 mb-4 sm:mb-6'>
                <Settings className='h-8 w-8 sm:h-12 sm:w-12 text-primary/40' />
              </div>
              <h3 className='text-lg sm:text-xl font-semibold mb-2 sm:mb-3'>{t('playground.chat.empty.title')}</h3>
              <p className='text-muted-foreground max-w-md mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base'>
                {isSessionActive
                  ? t('playground.chat.empty.activeDescription')
                  : t('playground.chat.empty.inactiveDescription')}
              </p>
            </div>
          ) : (
            // Virtual messages
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const message = messages[virtualRow.index];
              if (!message) return null;
              

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`absolute top-0 left-0 w-full flex ${
                    message.role === 'human' ? 'justify-end' : 'justify-start'
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '1rem',
                  }}>
                  <div
                    className={`rounded-xl p-4 max-w-[85%] shadow-sm ${
                      message.role === 'human'
                        ? 'bg-primary text-primary-foreground ml-4'
                        : message.role === 'tool'
                          ? 'bg-muted/80 border border-muted-foreground/10'
                          : message.isPartial
                            ? 'bg-secondary/80 border-l-4 border-primary/60 animate-pulse'
                            : 'bg-secondary'
                    }`}>
                    {message.role === 'ai' && (
                      <div className='text-xs text-muted-foreground/70 mb-2 flex items-center flex-wrap'>
                        {message.timestamp && (
                          <>
                            <span>{message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString() : new Date(message.timestamp).toLocaleTimeString()}</span>
                            <span className="mx-2">·</span>
                          </>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getModelBadgeClass(message.model)}`}>
                          {message.model || 'AI Model'}
                        </span>
                        {message.isPartial && (
                          <>
                            <span className="mx-2">·</span>
                            <span className="flex items-center">
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              {t('playground.chat.thinking')}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {message.role !== 'ai' && message.timestamp && (
                      <div className='text-xs text-muted-foreground/70 mb-2'>
                        <span>{message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString() : new Date(message.timestamp).toLocaleTimeString()}</span>
                      </div>
                    )}

                    {message.role === 'tool' && (
                      <div className='text-xs text-muted-foreground mb-2 flex items-center'>
                        <Settings className='h-3 w-3 mr-1' />
                        {t('playground.chat.tool.title')}
                      </div>
                    )}

                    <div className='whitespace-pre-wrap text-sm leading-relaxed break-words'>
                      {typeof message.content === 'string'
                        ? message.content
                        : 'Complex content (see console)'}
                    </div>

                    {message.debug && (
                      <details className='mt-2 text-xs opacity-50'>
                        <summary className='cursor-pointer hover:text-primary'>
                          {t('playground.chat.tool.debugInfo')}
                        </summary>
                        <div className='p-2 mt-1 bg-black/10 rounded text-xs font-mono whitespace-pre-wrap break-words overflow-wrap-anywhere'>
                          {message.debug}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })
          )}
              
          {/* Thinking indicator */}
          {isThinking && (
            <div className="absolute bottom-0 left-0 w-full flex justify-start p-4">
              <div className="bg-secondary rounded-xl p-4 animate-pulse flex items-center space-x-3 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">{t('playground.chat.thinking')}</span>
                <span className="text-sm animate-bounce delay-100">.</span>
                <span className="text-sm animate-bounce delay-200">.</span>
                <span className="text-sm animate-bounce delay-300">.</span>
              </div>
            </div>
          )}
                </div> 
        {/* Messages end ref for scrolling */}
        <div ref={messagesEndRef} />
      </div>
      
      <Separator />
      
      {/* Input Area - Fixed position at bottom */}
      <div className='flex-shrink-0 p-3 sm:p-4 bg-background/95 backdrop-blur-sm border-t border-border/50'>
        {isSessionActive ? (
          <div className='flex w-full items-end space-x-2 sm:space-x-3 max-w-4xl mx-auto'>
            <Textarea
              placeholder={t('playground.chat.input.activePlaceholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isProcessing || isThinking}
              className='flex-1 min-h-10 sm:min-h-12 max-h-32 resize-none bg-background border-border focus:border-primary/50 transition-colors text-sm sm:text-base'
              rows={1}
            />
            <Button
              size='icon'
              onClick={sendMessage}
              disabled={!inputValue.trim() || isProcessing || isThinking}
              className={`h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 transition-all ${
                isProcessing || isThinking ? 'animate-pulse' : ''
              } bg-primary hover:bg-primary/90`}>
              {isThinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className='h-4 w-4' />
              )}
            </Button>
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center text-center py-3 sm:py-4'>
            {messages.length > 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                    {t('playground.chat.sessionEnded')}
                </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <Button
                className='bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 px-4 sm:px-6 py-2 text-sm sm:text-base'
                onClick={startSession}
                disabled={
                  isProcessing ||
                  (mcpServers?.filter((s) => s.status === 'ACTIVE').length === 0 && !llmConfig.ragEnabled)
                }>
                {isProcessing ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {t('playground.actions.starting')}
                  </>
                ) : (
                  <>
                    <Send className='w-4 h-4 mr-2' />
                    {messages.length > 0 ? t('playground.actions.startNewSession') : t('playground.actions.start')}
                  </>
                )}
              </Button>
              
              {/* Mobile Configuration Button */}
              {(mcpServers?.filter((s) => s.status === 'ACTIVE').length === 0 && !llmConfig.ragEnabled) && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('playground.chat.selectServerOrEnableRagHint')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

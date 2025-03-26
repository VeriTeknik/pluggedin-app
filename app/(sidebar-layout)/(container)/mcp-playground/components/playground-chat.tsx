'use client';

import { Send, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

interface Message {
  role: string;
  content: string;
  debug?: string;
  timestamp?: Date;
}

interface PlaygroundChatProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isSessionActive: boolean;
  isProcessing: boolean;
  sendMessage: () => void;
  startSession: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  mcpServers?: {
    status: string;
  }[];
}

export function PlaygroundChat({
  messages,
  inputValue,
  setInputValue,
  isSessionActive,
  isProcessing,
  sendMessage,
  startSession,
  messagesEndRef,
  mcpServers,
}: PlaygroundChatProps) {
  const { t } = useTranslation();
  
  // Auto scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isNearBottom) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [messages]);

  return (
    <Card className='flex flex-col h-[calc(100vh-12rem)] shadow-sm'>
      <CardHeader className='pb-3'>
        <CardTitle>{t('playground.chat.title')}</CardTitle>
        <CardDescription>
          {t('playground.chat.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex-1 overflow-hidden'>
        <ScrollArea className='h-[calc(100vh-20rem)] pr-4'>
          {messages.length === 0 ? (
            <div className='flex flex-col items-center justify-center h-full text-center p-8'>
              <div className='bg-muted/30 rounded-full p-4 mb-4'>
                <Settings className='h-10 w-10 text-primary/40' />
              </div>
              <h3 className='text-lg font-medium mb-2'>{t('playground.chat.empty.title')}</h3>
              <p className='text-muted-foreground max-w-md'>
                {isSessionActive
                  ? t('playground.chat.empty.activeDescription')
                  : t('playground.chat.empty.inactiveDescription')}
              </p>
              {!isSessionActive && (
                <Button
                  className='mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                  onClick={startSession}
                  disabled={
                    isProcessing ||
                    mcpServers?.filter((s) => s.status === 'ACTIVE')
                      .length === 0
                  }>
                  {isProcessing ? (
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Send className='w-4 h-4 mr-2' />
                  )}
                  {isProcessing ? t('playground.actions.starting') : t('playground.actions.start')}
                </Button>
              )}
            </div>
          ) : (
            <div className='space-y-4 pb-1'>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'human'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}>
                  <div
                    className={`rounded-lg p-3 max-w-[90%] ${
                      message.role === 'human'
                        ? 'bg-primary text-primary-foreground ml-4'
                        : message.role === 'tool'
                          ? 'bg-muted/80 border border-muted-foreground/10'
                          : 'bg-secondary'
                    }`}>
                    {message.timestamp && (
                      <div className='text-xs text-muted-foreground/70 mb-1'>
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    )}

                    {message.role === 'tool' && (
                      <div className='text-xs text-muted-foreground mb-1 flex items-center'>
                        <Settings className='h-3 w-3 mr-1' />
                        {t('playground.chat.tool.title')}
                      </div>
                    )}

                    <div className='whitespace-pre-wrap'>
                      {typeof message.content === 'string'
                        ? message.content
                        : 'Complex content (see console)'}
                    </div>

                    {message.debug && (
                      <details className='mt-1 text-xs opacity-50'>
                        <summary className='cursor-pointer hover:text-primary'>
                          {t('playground.chat.tool.debugInfo')}
                        </summary>
                        <div className='p-1 mt-1 bg-black/10 rounded'>
                          {message.debug}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <Separator />
      <CardFooter className='p-4'>
        <div className='flex w-full items-center space-x-2'>
          <Textarea
            placeholder={
              isSessionActive
                ? t('playground.chat.input.activePlaceholder')
                : t('playground.chat.input.inactivePlaceholder')
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={!isSessionActive || isProcessing}
            className='flex-1 min-h-10 resize-none bg-background border-muted-foreground/20'
          />
          <Button
            size='icon'
            onClick={sendMessage}
            disabled={
              !isSessionActive || !inputValue.trim() || isProcessing
            }
            className={`transition-all ${isProcessing ? 'animate-pulse' : ''}`}>
            <Send className='h-4 w-4' />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

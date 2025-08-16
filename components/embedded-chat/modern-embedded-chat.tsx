'use client';

import { Bot, ChevronDown, Loader2, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CompactTaskView } from './compact-task-view';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ModernEmbeddedChatProps {
  chatUuid: string;
  chatConfig?: any;
  className?: string;
  onClose?: () => void;
}

export function ModernEmbeddedChat({ 
  chatUuid, 
  chatConfig,
  className,
  onClose 
}: ModernEmbeddedChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [tasks, setTasks] = useState([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const cleanAndFormatMessage = (content: string) => {
    // Remove JSON debug data and clean up message
    let cleaned = content;
    
    // Remove JSON blocks (including partial ones)
    cleaned = cleaned.replace(/\{[^}]*"title"[^}]*\}/g, '');
    cleaned = cleaned.replace(/\{[^}]*"proposedDateTime"[^}]*\}/g, '');
    cleaned = cleaned.replace(/\{[^}]*"needsConfirmation"[^}]*\}/g, '');
    cleaned = cleaned.replace(/\{[^}]*"intent"[^}]*\}/g, '');
    cleaned = cleaned.replace(/\{[^}]*"action"[^}]*\}/g, '');
    cleaned = cleaned.replace(/\{[^}]*"existingData"[^}]*\}/g, '');
    
    // Remove standalone JSON fragments
    cleaned = cleaned.replace(/\{,\s*"[^"]+"\s*:\s*[^}]+\}/g, '');
    cleaned = cleaned.replace(/^\s*\{,/gm, '');
    cleaned = cleaned.replace(/\},?\s*$/gm, '');
    
    // Clean up formatting
    cleaned = cleaned.replace(/^\s*[,}\]]\s*/gm, '');
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    cleaned = cleaned.trim();
    
    // Format meeting-related messages with icons
    if (cleaned.includes('schedule a meeting') || cleaned.includes('proposed a meeting')) {
      cleaned = cleaned.replace(/I'll help you schedule a meeting/g, '📅 I\'ll help you schedule a meeting');
      cleaned = cleaned.replace(/I've proposed a meeting/g, '✅ I\'ve proposed a meeting');
      cleaned = cleaned.replace(/Could you please confirm/g, '❓ Could you please confirm');
      
      // Format dates nicely
      cleaned = cleaned.replace(/(\w+,\s+\w+\s+\d+,\s+\d{4})/g, '**$1**');
      cleaned = cleaned.replace(/(\d{1,2}:\d{2}\s*[AP]M)/gi, '**$1**');
      
      // Add bullet points for requirements
      cleaned = cleaned.replace(/meeting title and provide/g, 'meeting title and provide:\n• Meeting title\n•');
    }
    
    // Format general lists and important info
    cleaned = cleaned.replace(/Please provide:/g, '📝 **Please provide:**');
    cleaned = cleaned.replace(/Note:/g, '💡 **Note:**');
    cleaned = cleaned.replace(/Important:/g, '⚠️ **Important:**');
    
    return cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate assistant response (replace with actual API call)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I\'ll help you with that request. Let me process your information...',
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
      
      // Simulate streaming completion
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, isStreaming: false }
            : msg
        ));
      }, 1000);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800",
      className
    )}>
      {/* Simplified Header */}
      <div className="border-b bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {chatConfig?.name || 'AI Assistant'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Always ready to help
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {showTasks && (
              <button
                onClick={() => setShowTasks(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tasks View (if any) */}
      {tasks.length > 0 && (
        <div className="px-4 py-2 border-b bg-gray-50 dark:bg-gray-800/50">
          <CompactTaskView
            tasks={tasks}
            workflowName="Current Tasks"
            className="w-full"
          />
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              How can I help you today?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              I'm here to assist with scheduling, answering questions, and helping you be more productive.
            </p>
            
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 mt-6">
              {['Schedule a meeting', 'Set a reminder', 'Get help'].map((action) => (
                <button
                  key={action}
                  onClick={() => setInput(action)}
                  className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2.5",
                    message.role === 'user'
                      ? "bg-blue-500 text-white"
                      : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                    {message.role === 'assistant' ? (
                      <div dangerouslySetInnerHTML={{ 
                        __html: cleanAndFormatMessage(message.content)
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/•/g, '&bull;')
                          .replace(/\n/g, '<br />')
                      }} />
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                  {message.isStreaming && (
                    <div className="flex gap-1 mt-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                    </div>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      You
                    </span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-white dark:bg-gray-800 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          </div>
          
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              "p-2 rounded-lg transition-all",
              input.trim() && !isLoading
                ? "bg-blue-500 hover:bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
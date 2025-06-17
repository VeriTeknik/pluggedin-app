'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { McpServer } from '@/types/mcp-server';

import { ChatHeader } from './components/chat-header';
import { PlaygroundChat } from './components/playground-chat';
import { PlaygroundConfig } from './components/playground-config';
import { usePlayground } from './hooks/usePlayground';

export default function McpPlaygroundPage() {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // Changed to lg breakpoint
      // Auto-collapse sidebar on mobile
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('playground-sidebar-collapsed');
    if (saved !== null && !isMobile) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, [isMobile]);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem('playground-sidebar-collapsed', JSON.stringify(sidebarCollapsed));
    }
  }, [sidebarCollapsed, isMobile]);

  const {
    // State & Derived State
    activeTab,
    setActiveTab,
    logLevel,
    setLogLevel,
    llmConfig,
    setLlmConfig,
    isUpdatingServer,
    sessionError,
    setSessionError,
    isSessionActive,
    messages,
    inputValue,
    setInputValue,
    isProcessing,
    isThinking,
    clientLogs,
    setClientLogs,
    serverLogs,
    setServerLogs,
    isLoading,
    mcpServers,
    
    // Refs
    messagesEndRef,
    logsEndRef,
    
    // Functions
    toggleServerStatus,
    startSession,
    endSession,
    sendMessage,
    saveSettings,
    switchModel,
  } = usePlayground();

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleModelSwitch = async (provider: string, model: string) => {
    const newConfig = {
      ...llmConfig,
      provider: provider as 'openai' | 'anthropic' | 'google',
      model: model,
    };
    await switchModel(newConfig);
  };

  // Calculate active server count based on server status
  const activeServerCount = mcpServers?.filter((s: McpServer) => s.status === 'ACTIVE').length || 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && !sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar - Increased width for better log viewing */}
      <div className={`
        ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}
        ${sidebarCollapsed ? (isMobile ? '-translate-x-full' : 'w-16') : 'w-[480px]'}
        transition-all duration-300 ease-in-out
        bg-background border-r border-border
        flex flex-col flex-shrink-0
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          {!sidebarCollapsed && (
            <div>
              <h2 className="text-lg font-semibold">{t('playground.config.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('playground.config.subtitle')}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={`${sidebarCollapsed ? 'w-full justify-center' : 'ml-auto'} h-8 w-8 p-0`}
          >
            {sidebarCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className={`flex-1 min-h-0 ${sidebarCollapsed ? 'hidden' : 'block'}`}>
          <PlaygroundConfig
            logsEndRef={logsEndRef}
            isLoading={isLoading}
            mcpServers={mcpServers}
            clearLogs={() => {
              setClientLogs([]);
              setServerLogs([]);
            }}
            saveSettings={saveSettings}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            isUpdatingServer={isUpdatingServer}
            sessionError={sessionError}
            setSessionError={setSessionError}
            toggleServerStatus={toggleServerStatus}
            llmConfig={llmConfig}
            setLlmConfig={setLlmConfig}
            switchModel={switchModel}
            logLevel={logLevel}
            setLogLevel={setLogLevel}
            clientLogs={clientLogs}
            serverLogs={serverLogs}
          />
        </div>

        {/* Collapsed Sidebar Actions */}
        {sidebarCollapsed && !isMobile && (
          <div className="p-2 space-y-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={startSession}
              disabled={isProcessing || isSessionActive || activeServerCount === 0}
              className="w-full h-8 p-0"
              title={t('playground.actions.start')}
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </Button>
            {isSessionActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={endSession}
                className="w-full h-8 p-0 text-red-500 hover:text-red-600"
                title={t('playground.actions.end')}
              >
                <div className="w-2 h-2 rounded-full bg-red-500" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <ChatHeader
          currentModel={llmConfig}
          serverCount={activeServerCount}
          isSessionActive={isSessionActive}
          onModelSwitch={handleModelSwitch}
          onOpenSettings={() => setSidebarCollapsed(false)}
          onEndSession={endSession}
          isProcessing={isProcessing}
        />

        {/* Chat Interface - Fixed height calculation */}
        <div className="flex-1 min-h-0">
          <PlaygroundChat
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            isThinking={isThinking}
            sendMessage={sendMessage}
            startSession={startSession}
            messagesEndRef={messagesEndRef}
            mcpServers={mcpServers}
            llmConfig={llmConfig}
          />
        </div>
      </div>
    </div>
  );
}

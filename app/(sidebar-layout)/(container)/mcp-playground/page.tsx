'use client';

import { useProfiles } from '@/hooks/use-profiles'; // Keep profile hook here as it's needed early

import { PlaygroundChat } from './components/playground-chat';
import { PlaygroundConfig } from './components/playground-config';
import { PlaygroundHero } from './components/playground-hero';
import { usePlayground } from './hooks/usePlayground'; // Import the new hook

export default function McpPlaygroundPage() {
  // Use the custom hook to manage state and logic
  const {
    // State & Derived State
    activeTab,
    logLevel,
    llmConfig,
    isUpdatingServer,
    sessionError,
    isSessionActive,
    messages,
    inputValue,
    isProcessing,
    isThinking,
    clientLogs,
    serverLogs,
    isLoading, // Combined loading state from hook
    mcpServers,

    // Refs
    messagesEndRef,
    logsEndRef,

    // Setters & Functions
    setActiveTab,
    setLogLevel,
    setLlmConfig,
    setSessionError,
    setInputValue,
    setClientLogs,
    setServerLogs,
    toggleServerStatus,
    startSession,
    endSession,
    sendMessage,
    saveSettings,
    // setUserScrollControlled is managed within the hook now
  } = usePlayground();

  // Need profileUuid for the config component key, get it directly
  const { currentProfile } = useProfiles();
  const profileUuid = currentProfile?.uuid || '';

  return (
    <div className='container mx-auto py-6 space-y-6'>
      {/* Pass necessary props from the hook to PlaygroundHero */}
      <PlaygroundHero
        isSessionActive={isSessionActive}
        isProcessing={isProcessing}
        startSession={startSession}
        endSession={endSession}
        mcpServers={mcpServers}
        llmConfig={llmConfig}
      />

      <div className='grid grid-cols-12 gap-6'>
        {/* Config section */}
        <div className='col-span-12 md:col-span-5 lg:col-span-4'>
          {/* Ensure profileUuid is available before rendering config */}
          {profileUuid && (
            <PlaygroundConfig
              key={profileUuid} // Use profileUuid as key if needed for re-renders on profile change
              isLoading={isLoading} // Use combined loading state
              mcpServers={mcpServers}
              isSessionActive={isSessionActive}
              isProcessing={isProcessing}
              isUpdatingServer={isUpdatingServer}
              sessionError={sessionError}
              setSessionError={setSessionError}
              toggleServerStatus={toggleServerStatus}
              llmConfig={llmConfig}
              setLlmConfig={setLlmConfig}
              logLevel={logLevel}
              setLogLevel={setLogLevel}
              clientLogs={clientLogs}
              serverLogs={serverLogs}
              clearLogs={() => {
                setClientLogs([]); // Use setters from hook
                setServerLogs([]);
              }}
              saveSettings={saveSettings}
              logsEndRef={logsEndRef}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          )}
        </div>

        {/* Chat section */}
        <div className='col-span-12 md:col-span-7 lg:col-span-8'>
          <PlaygroundChat
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue} // Pass setter from hook
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            isThinking={isThinking}
            sendMessage={sendMessage}
            startSession={startSession} // Pass startSession from hook
            messagesEndRef={messagesEndRef}
            mcpServers={mcpServers} // Pass mcpServers from hook
          />
        </div>
      </div>
    </div>
  );
}

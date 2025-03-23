'use client';

import { ArrowRight, Play, Power, Send, Settings } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import { executePlaygroundQuery, getOrCreatePlaygroundSession, endPlaygroundSession } from '@/app/actions/mcp-playground';
import { getMcpServers } from '@/app/actions/mcp-servers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';

export default function McpPlaygroundPage() {
  const { toast } = useToast();
  const { currentProfile } = useProfiles();
  const profileUuid = currentProfile?.uuid || '';

  // State for LLM configuration
  const [llmConfig, setLlmConfig] = useState({
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    temperature: 0,
    maxTokens: 1000,
  });

  // State for selected servers
  const [selectedServerUuids, setSelectedServerUuids] = useState<string[]>([]);
  
  // State for session
  const [isSessionActive, setIsSessionActive] = useState(false);
  
  // State for chat
  const [messages, setMessages] = useState<{ 
    role: string; 
    content: string;
    debug?: string;
  }[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch MCP servers
  const { data: mcpServers, isLoading } = useSWR(
    profileUuid ? `${profileUuid}/mcp-servers` : null,
    () => getMcpServers(profileUuid)
  );

  // Toggle server selection
  const toggleServerSelection = (serverUuid: string) => {
    setSelectedServerUuids(prev => 
      prev.includes(serverUuid)
        ? prev.filter(id => id !== serverUuid)
        : [...prev, serverUuid]
    );
  };

  // Start session
  const startSession = async () => {
    if (selectedServerUuids.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one MCP server.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsProcessing(true);
      
      const result = await getOrCreatePlaygroundSession(
        profileUuid,
        selectedServerUuids,
        {
          provider: llmConfig.provider as 'openai' | 'anthropic',
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
        }
      );
      
      if (result.success) {
        setIsSessionActive(true);
        setMessages([]);
        toast({
          title: 'Success',
          description: 'MCP playground session started.',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to start session.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // End session
  const endSession = async () => {
    try {
      setIsProcessing(true);
      
      const result = await endPlaygroundSession(profileUuid);
      
      if (result.success) {
        setIsSessionActive(false);
        toast({
          title: 'Success',
          description: 'MCP playground session ended.',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to end session.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!inputValue.trim() || !isSessionActive) return;

    try {
      setIsProcessing(true);
      // Add user message
      const userMessage = { role: 'human', content: inputValue };
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');

      // Execute query
      const result = await executePlaygroundQuery(profileUuid, userMessage.content);
      
      if (result.success) {
        // Add all messages from the result
        if (result.messages) {
          // Filter out messages we already have
          const currentMessageContents = messages.map(m => m.content);
          const newMessages = result.messages.filter(
            m => !currentMessageContents.includes(m.content)
          );
          
          if (newMessages.length > 0) {
            setMessages(prev => [...prev, ...newMessages]);
          }
        }
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to execute query.',
          variant: 'destructive',
        });
        // Add error message to chat
        setMessages(prev => [
          ...prev, 
          { role: 'ai', content: `Error: ${result.error || 'Failed to execute query.'}` }
        ]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
      // Add error message to chat
      setMessages(prev => [
        ...prev, 
        { role: 'ai', content: 'An unexpected error occurred.' }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>MCP Playground</CardTitle>
          <CardDescription>
            Test your MCP servers with the LangChain integration
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Configure the LLM and select MCP servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="servers">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="servers">MCP Servers</TabsTrigger>
                  <TabsTrigger value="llm">LLM Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="servers" className="space-y-4 mt-4">
                  {isLoading ? (
                    <p>Loading servers...</p>
                  ) : mcpServers?.length === 0 ? (
                    <div className="text-center p-4">
                      <p className="text-muted-foreground">No MCP servers configured.</p>
                      <Button 
                        variant="link" 
                        className="mt-2"
                        onClick={() => window.location.href = '/mcp-servers'}
                      >
                        Go to MCP Servers
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {mcpServers?.map((server: McpServer) => (
                        <div key={server.uuid} className="flex items-center space-x-2">
                          <Checkbox 
                            id={server.uuid}
                            checked={selectedServerUuids.includes(server.uuid)}
                            onCheckedChange={() => toggleServerSelection(server.uuid)}
                            disabled={isSessionActive}
                          />
                          <Label 
                            htmlFor={server.uuid}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="font-medium">{server.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {server.type} {server.description && `- ${server.description}`}
                            </div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="llm" className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={llmConfig.provider}
                      onValueChange={(value) => 
                        setLlmConfig({...llmConfig, provider: value})
                      }
                      disabled={isSessionActive}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={llmConfig.model}
                      onValueChange={(value) => 
                        setLlmConfig({...llmConfig, model: value})
                      }
                      disabled={isSessionActive}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {llmConfig.provider === 'anthropic' ? (
                          <>
                            <SelectItem value="claude-3-7-sonnet-20250219">Claude 3.7 Sonnet</SelectItem>
                            <SelectItem value="Claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="temperature">Temperature</Label>
                    <Input
                      id="temperature"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={llmConfig.temperature}
                      onChange={(e) => 
                        setLlmConfig({
                          ...llmConfig, 
                          temperature: parseFloat(e.target.value)
                        })
                      }
                      disabled={isSessionActive}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      min="100"
                      max="4000"
                      step="100"
                      value={llmConfig.maxTokens}
                      onChange={(e) => 
                        setLlmConfig({
                          ...llmConfig, 
                          maxTokens: parseInt(e.target.value)
                        })
                      }
                      disabled={isSessionActive}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              {!isSessionActive ? (
                <Button 
                  className="w-full"
                  onClick={startSession}
                  disabled={isProcessing || selectedServerUuids.length === 0}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Session
                </Button>
              ) : (
                <Button 
                  className="w-full"
                  variant="destructive"
                  onClick={endSession}
                  disabled={isProcessing}
                >
                  <Power className="w-4 h-4 mr-2" />
                  End Session
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Chat Interface */}
        <div className="md:col-span-2">
          <Card className="flex flex-col h-[calc(100vh-12rem)]">
            <CardHeader>
              <CardTitle>Chat Interface</CardTitle>
              <CardDescription>
                Test your MCP servers with natural language
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-20rem)] pr-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">MCP Playground</h3>
                    <p className="text-muted-foreground">
                      {isSessionActive 
                        ? "Start chatting to test your MCP servers" 
                        : "Select MCP servers and start a session to begin"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div 
                        key={index}
                        className={`flex ${
                          message.role === 'human' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div 
                          className={`rounded-lg p-3 max-w-[80%] ${
                            message.role === 'human' 
                              ? 'bg-primary text-primary-foreground ml-4' 
                              : message.role === 'tool'
                                ? 'bg-muted'
                                : 'bg-secondary'
                          }`}
                        >
                          {message.role === 'tool' && (
                            <div className="text-xs text-muted-foreground mb-1">
                              Tool Execution
                            </div>
                          )}
                          <div className="whitespace-pre-wrap">
                            {typeof message.content === 'string' 
                              ? message.content 
                              : "Complex content (see console)"}
                          </div>
                          {message.debug && (
                            <details className="mt-1 text-xs opacity-50">
                              <summary>Debug Info</summary>
                              <div className="p-1 mt-1 bg-black/10 rounded">{message.debug}</div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
            <Separator />
            <CardFooter className="p-4">
              <div className="flex w-full items-center space-x-2">
                <Textarea
                  placeholder={isSessionActive 
                    ? "Type your message..." 
                    : "Start a session to begin chatting"
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
                  className="flex-1 min-h-10 h-10"
                />
                <Button 
                  size="icon"
                  onClick={sendMessage}
                  disabled={!isSessionActive || !inputValue.trim() || isProcessing}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
} 
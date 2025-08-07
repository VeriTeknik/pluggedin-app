'use client';

import {
  Check,
  Code,
  Copy,
  Download,
  Edit,
  FileText,
  MessageSquare,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { EnhancedChatWidget, EnhancedChatWidgetRef } from '@/components/chat/enhanced-chat-widget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface DemoClientProps {
  chatUuid: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
}

export function DemoClient({ chatUuid, userId, userName, userAvatar }: DemoClientProps) {
  const { toast } = useToast();
  const [activeDemo, setActiveDemo] = useState('basic');
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const chatWidgetRef = useRef<EnhancedChatWidgetRef>(null);

  const chatConfig = {
    chatUuid,
    visitorInfo: {
      visitor_id: `demo-${userId}`,
      name: userName,
    },
    authenticatedUser: {
      id: userId,
      name: userName,
      avatar: userAvatar || undefined,
    },
    customSystemPrompt: "You are a helpful AI assistant demonstrating enhanced chat capabilities. You can help with code, explanations, file analysis, and more. Feel free to use markdown formatting in your responses.",
    appearance: {
      primaryColor: '#3b82f6',
      position: 'bottom-right' as const,
    }
  };

  const features = [
    {
      icon: MessageSquare,
      title: 'Real-time Streaming',
      description: 'Messages appear as they are generated with typing indicators',
      status: 'implemented'
    },
    {
      icon: Code,
      title: 'Enhanced Markdown',
      description: 'Full markdown support with syntax highlighting for code blocks',
      status: 'implemented'
    },
    {
      icon: FileText,
      title: 'File Attachments',
      description: 'Upload and share documents, images, and other files',
      status: 'implemented'
    },
    {
      icon: Edit,
      title: 'Message Editing',
      description: 'Edit your messages after sending them',
      status: 'implemented'
    },
    {
      icon: RotateCcw,
      title: 'Response Regeneration',
      description: 'Regenerate AI responses for different perspectives',
      status: 'implemented'
    },
    {
      icon: Settings,
      title: 'Custom System Prompts',
      description: 'Configure custom instructions per conversation',
      status: 'implemented'
    },
    {
      icon: Download,
      title: 'Export Conversations',
      description: 'Export chat history as JSON for backup or analysis',
      status: 'implemented'
    },
    {
      icon: Upload,
      title: 'Import Conversations',
      description: 'Import previously exported conversations',
      status: 'implemented'
    },
  ];

  const demoScenarios = [
    {
      id: 'basic',
      title: 'Basic Chat',
      description: 'Simple conversation with enhanced formatting',
      prompt: 'Hi! Can you explain what React hooks are and show me a simple example?'
    },
    {
      id: 'code',
      title: 'Code Assistance',
      description: 'Programming help with syntax highlighting',
      prompt: 'Can you help me write a TypeScript function that fetches data from an API with proper error handling?'
    },
    {
      id: 'markdown',
      title: 'Rich Formatting',
      description: 'Demonstrate markdown capabilities',
      prompt: 'Can you create a detailed comparison table between React and Vue.js with pros and cons?'
    },
    {
      id: 'files',
      title: 'File Handling',
      description: 'Upload and discuss files',
      prompt: 'I want to upload a file and discuss its contents. Can you help me analyze it?'
    }
  ];

  const quickTestMessages = [
    "Hello! Can you demonstrate your markdown capabilities?",
    "Show me a TypeScript example with syntax highlighting",
    "Create a table comparing different programming languages",
    "Can you help me with file upload functionality?",
    "What are the benefits of this enhanced chat system?"
  ];

  // Handle demo scenario selection
  const handleDemoScenario = (scenario: typeof demoScenarios[0]) => {
    setActiveDemo(scenario.id);
    
    // First set the input value to show the prompt
    chatWidgetRef.current?.setInputValue(scenario.prompt);
    
    // Show success feedback
    toast({
      title: "Demo Scenario Selected",
      description: `${scenario.title}: Prompt loaded into chat input. Click Send to continue.`,
      duration: 3000,
    });
  };

  // Handle quick test message click
  const handleQuickTestMessage = (message: string, index: number) => {
    // Copy to clipboard
    navigator.clipboard.writeText(message).then(() => {
      // Auto-populate chat input
      chatWidgetRef.current?.setInputValue(message);
      
      // Show visual feedback
      setCopiedMessageIndex(index);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
      
      toast({
        title: "Message Ready",
        description: "Message copied to clipboard and loaded into chat input",
        duration: 2000,
      });
    }).catch(() => {
      // Fallback: just populate input if clipboard fails
      chatWidgetRef.current?.setInputValue(message);
      toast({
        title: "Message Loaded",
        description: "Message loaded into chat input",
        duration: 2000,
      });
    });
  };

  // Send message directly for demo scenarios
  const sendDemoMessage = (scenario: typeof demoScenarios[0]) => {
    setActiveDemo(scenario.id);
    chatWidgetRef.current?.sendMessage(scenario.prompt);
    
    toast({
      title: "Demo Started",
      description: `${scenario.title}: Message sent automatically`,
      duration: 3000,
    });
  };

  return (
    <div className="space-y-6">
      {/* Feature Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Phase 2 Enhancement Features
          </CardTitle>
          <CardDescription>
            All features have been implemented and are ready for testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <div key={index} className="flex flex-col items-center text-center p-4 border rounded-lg">
                <feature.icon className="h-8 w-8 mb-2 text-primary" />
                <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground mb-2">{feature.description}</p>
                <Badge variant="default" className="text-xs">
                  ✓ Ready
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Demo Interface */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Demo Controls */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Demo Scenarios</CardTitle>
              <CardDescription>
                Try different use cases to explore features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {demoScenarios.map((scenario) => (
                <div key={scenario.id} className="space-y-2">
                  <Button
                    variant={activeDemo === scenario.id ? "default" : "outline"}
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => handleDemoScenario(scenario)}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{scenario.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {scenario.description}
                      </div>
                    </div>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => sendDemoMessage(scenario)}
                  >
                    <Send className="h-3 w-3 mr-2" />
                    Send Directly
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Test Messages</CardTitle>
              <CardDescription>
                Click to copy and auto-populate chat input
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickTestMessages.map((message, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 border rounded text-sm cursor-pointer hover:bg-muted transition-all"
                  onClick={() => handleQuickTestMessage(message, index)}
                >
                  {copiedMessageIndex === index ? (
                    <Check className="h-3 w-3 flex-shrink-0 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 flex-shrink-0" />
                  )}
                  <span className="text-xs flex-1">{message}</span>
                  <Badge
                    variant={copiedMessageIndex === index ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {copiedMessageIndex === index ? "Loaded" : "Click to copy"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Chat Widget */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Enhanced Chat Widget</CardTitle>
              <CardDescription>
                Interactive demo of the enhanced chat system with all Phase 2 features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-1 bg-muted/50">
                <EnhancedChatWidget
                  ref={chatWidgetRef}
                  config={chatConfig}
                  className="border-0 shadow-none bg-background"
                  height="600px"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Implementation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Implementation Guide</CardTitle>
          <CardDescription>
            How to integrate the enhanced chat widget in your applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="react" className="w-full">
            <TabsList>
              <TabsTrigger value="react">React Component</TabsTrigger>
              <TabsTrigger value="embed">Embed Script</TabsTrigger>
              <TabsTrigger value="api">API Usage</TabsTrigger>
            </TabsList>
            
            <TabsContent value="react" className="space-y-4">
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4">
                <pre className="text-sm overflow-x-auto">
                  <code>{`import { EnhancedChatWidget } from '@/components/chat/enhanced-chat-widget';

const config = {
  chatUuid: 'your-chat-uuid',
  visitorInfo: {
    visitor_id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com'
  },
  customSystemPrompt: 'Your custom instructions...',
  appearance: {
    primaryColor: '#3b82f6',
    position: 'bottom-right'
  }
};

export function MyApp() {
  return (
    <EnhancedChatWidget 
      config={config}
      height="500px"
      onMessage={(message) => console.log('New message:', message)}
    />
  );
}`}</code>
                </pre>
              </div>
            </TabsContent>
            
            <TabsContent value="embed" className="space-y-4">
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4">
                <pre className="text-sm overflow-x-auto">
                  <code>{`<!-- Enhanced Chat Widget Embed -->
<script src="/api/embed/${chatUuid}.js"></script>
<script>
  PluggedInChat.init({
    chatUuid: '${chatUuid}',
    apiKey: 'your-api-key', // If required
    position: 'bottom-right',
    theme: {
      primaryColor: '#3b82f6',
      borderRadius: '8px'
    },
    features: {
      fileUpload: true,
      markdown: true,
      exportChat: true
    }
  });
</script>`}</code>
                </pre>
              </div>
            </TabsContent>
            
            <TabsContent value="api" className="space-y-4">
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4">
                <pre className="text-sm overflow-x-auto">
                  <code>{`// Send message with file attachment
const response = await fetch('/api/public/chat/{uuid}/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    message: 'Hello, can you analyze this file?',
    conversation_id: 'conversation-uuid',
    visitor_info: { visitor_id: 'user-123' },
    attachments: [{
      name: 'document.pdf',
      type: 'application/pdf',
      data: 'base64-encoded-data'
    }]
  })
});

// Stream response
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = new TextDecoder().decode(value);
  // Process streaming data...
}`}</code>
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
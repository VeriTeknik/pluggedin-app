import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEmbeddedChat } from '@/app/actions/social';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getAuthSession } from '@/lib/auth';

interface ChatPageProps {
  params: {
    uuid: string;
  };
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { uuid } = params;
  const chat = await getEmbeddedChat(uuid);

  if (!chat || !chat.is_active || !chat.is_public) {
    notFound();
  }

  // Get user session
  const session = await getAuthSession();

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={chat.profile?.username ? `/to/${chat.profile.username}` : '/discover'}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to {chat.profile?.name || 'Profile'}
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{chat.title}</h1>
        {chat.description && (
          <p className="text-muted-foreground mt-2">{chat.description}</p>
        )}
        <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
          <span>Created by: {chat.profile?.name || 'Unknown'}</span>
          <span>•</span>
          <span>{new Date(chat.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="bg-muted/30 rounded-lg p-6 border">
          <h2 className="text-xl font-semibold mb-4">Chat with this AI Assistant</h2>
          
          <div className="space-y-6 mb-6">
            <div className="flex gap-4">
              <div className="bg-primary-foreground rounded-full h-10 w-10 flex items-center justify-center text-primary font-bold">
                AI
              </div>
              <div className="flex-1 bg-muted p-4 rounded-lg">
                <p>
                  Hello! I am an AI assistant created by {chat.profile?.name || 'the profile owner'}. 
                  How can I help you today?
                </p>
              </div>
            </div>
            
            {/* This would normally be populated with actual chat messages */}
          </div>
          
          <div className="relative">
            <Textarea 
              placeholder="Type your message here..."
              className="min-h-32 pr-20"
            />
            <Button 
              className="absolute bottom-4 right-4"
            >
              Send
            </Button>
          </div>
          
          <div className="mt-4 text-xs text-muted-foreground">
            <p>
              This is a shared AI assistant. Your conversations are not stored permanently 
              and are not visible to the creator of this chat.
            </p>
          </div>
        </div>
        
        <div className="bg-muted p-4 rounded-md">
          <h3 className="text-sm font-medium mb-2">Model settings</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Model</p>
              <p>{chat.settings?.model || 'Claude 3 Sonnet'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Temperature</p>
              <p>{chat.settings?.temperature || '0.7'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
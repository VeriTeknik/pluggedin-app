'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cleanupTestChat, getPublicChatsForUser } from '@/app/actions/cleanup-test-chat';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Search } from 'lucide-react';

export default function CleanupPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [publicChats, setPublicChats] = useState<any[]>([]);
  const [showChats, setShowChats] = useState(false);

  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const result = await cleanupTestChat();
      
      if (result.success) {
        toast({
          title: 'Cleanup Complete',
          description: result.message,
        });
        
        if (result.chatsUpdated && result.chatsUpdated.length > 0) {
          console.log('Updated chats:', result.chatsUpdated);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cleanup test chats',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckPublicChats = async () => {
    setIsLoading(true);
    try {
      const result = await getPublicChatsForUser('');
      
      if (result.success && result.data) {
        setPublicChats(result.data);
        setShowChats(true);
        
        if (result.data.length === 0) {
          toast({
            title: 'No Public Chats',
            description: 'There are no public chats in the system',
          });
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch public chats',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Embedded Chat Cleanup</CardTitle>
          <CardDescription>
            Remove test embedded chats from public profiles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This will find any embedded chats named "Test AI Assistant" that are marked as public and make them private.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleCleanup} 
              disabled={isLoading}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clean Up Test Chats
            </Button>
            
            <Button 
              onClick={handleCheckPublicChats} 
              disabled={isLoading}
              variant="outline"
            >
              <Search className="h-4 w-4 mr-2" />
              Check Public Chats
            </Button>
          </div>
          
          {showChats && publicChats.length > 0 && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Public Chats Found:</h3>
              <ul className="space-y-2">
                {publicChats.map((chat) => (
                  <li key={chat.uuid} className="text-sm">
                    <span className="font-mono text-xs">{chat.uuid}</span>
                    <br />
                    <span className="font-medium">{chat.name}</span>
                    {chat.name === 'Test AI Assistant' && (
                      <span className="ml-2 text-xs text-destructive">(Test - will be removed)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
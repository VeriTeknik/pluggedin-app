'use client';

import { 
  Briefcase,
  Calendar, 
  Check,
  Mail, 
  MessageSquare,
  Shield,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ChatCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface ChatCapabilitiesDisplayProps {
  capabilities: ChatCapability[];
  className?: string;
}

export function ChatCapabilitiesDisplay({ capabilities, className = '' }: ChatCapabilitiesDisplayProps) {
  if (capabilities.length === 0) {
    return null;
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'calendar':
        return <Calendar className="h-4 w-4" />;
      case 'communication':
        return <MessageSquare className="h-4 w-4" />;
      case 'crm':
        return <Briefcase className="h-4 w-4" />;
      case 'support':
        return <Shield className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  // Group capabilities by category
  const groupedCapabilities = capabilities.reduce((acc, cap) => {
    if (!acc[cap.category]) {
      acc[cap.category] = [];
    }
    acc[cap.category].push(cap);
    return acc;
  }, {} as Record<string, ChatCapability[]>);

  return (
    <Card className={`bg-white/50 dark:bg-gray-800/50 backdrop-blur ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <CardTitle className="text-lg">What I Can Do For You</CardTitle>
        </div>
        <CardDescription>
          This AI assistant has the following capabilities enabled
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(groupedCapabilities).map(([category, caps]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                {getCategoryIcon(category)}
                <h4 className="text-sm font-medium capitalize">{category}</h4>
              </div>
              <div className="grid gap-2 ml-6">
                {caps.map(cap => (
                  <div key={cap.id} className="flex items-start gap-2">
                    <Check className="h-3 w-3 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{cap.name}</p>
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Start a conversation to use any of these features. Just describe what you need!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
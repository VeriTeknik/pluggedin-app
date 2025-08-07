'use client';

import { 
  Briefcase,
  Calendar, 
  CheckCircle,
  Mail, 
  MessageSquare,
  Shield,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface ChatCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface ChatCapabilitiesBoxProps {
  capabilities: ChatCapability[];
  className?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'calendar':
      return <Calendar className="h-4 w-4 text-purple-500" />;
    case 'communication':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'crm':
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    case 'support':
      return <Shield className="h-4 w-4 text-amber-500" />;
    default:
      return <Sparkles className="h-4 w-4 text-purple-500" />;
  }
};

const getCategoryBadgeColor = (category: string) => {
  switch (category) {
    case 'calendar':
      return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-900';
    case 'communication':
      return 'bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900';
    case 'crm':
      return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900';
    case 'support':
      return 'bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900';
    default:
      return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-900';
  }
};

export function ChatCapabilitiesBox({ capabilities, className = '' }: ChatCapabilitiesBoxProps) {
  if (capabilities.length === 0) {
    return null;
  }

  // Group capabilities by category
  const groupedCapabilities = capabilities.reduce((acc, cap) => {
    if (!acc[cap.category]) {
      acc[cap.category] = [];
    }
    acc[cap.category].push(cap);
    return acc;
  }, {} as Record<string, ChatCapability[]>);

  return (
    <div className={`space-y-4 ${className}`}>
      {Object.entries(groupedCapabilities).map(([category, caps]) => (
        <Card key={category} className="relative">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 dark:bg-primary/20">
                {getCategoryIcon(category)}
              </div>
              <Badge 
                variant="outline" 
                className="bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900"
              >
                <CheckCircle className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">Active</span>
              </Badge>
            </div>
            <CardTitle className="mt-3 text-base sm:text-xl capitalize">
              {category} Capabilities
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {caps.length} {caps.length === 1 ? 'capability' : 'capabilities'} available
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              {caps.map(cap => (
                <div key={cap.id} className="flex items-center gap-2 text-sm">
                  <Badge 
                    variant="outline" 
                    className={`${getCategoryBadgeColor(category)} dark:border-slate-700`}
                  >
                    {cap.name}
                  </Badge>
                </div>
              ))}
              
              <div className="col-span-2 text-xs text-muted-foreground mt-3 pt-3 border-t">
                {category === 'calendar' && 'Book meetings, check availability, and manage schedules'}
                {category === 'communication' && 'Send emails and messages through various channels'}
                {category === 'crm' && 'Create leads and manage customer relationships'}
                {category === 'support' && 'Handle support tickets and team notifications'}
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-wrap gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              Just ask and I'll handle these tasks for you
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
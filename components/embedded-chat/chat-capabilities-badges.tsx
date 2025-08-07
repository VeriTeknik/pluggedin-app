'use client';

import { 
  Calendar,
  Mail, 
  MessageSquare,
  Sparkles,
  Database,
  Brain,
  Briefcase,
  Shield
} from 'lucide-react';

interface ChatCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface ChatCapabilitiesBadgesProps {
  capabilities: ChatCapability[];
  className?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'calendar':
      return <Calendar className="h-4 w-4" />;
    case 'communication':
      return <Mail className="h-4 w-4" />;
    case 'crm':
      return <Briefcase className="h-4 w-4" />;
    case 'support':
      return <Shield className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

export function ChatCapabilitiesBadges({ capabilities, className = '' }: ChatCapabilitiesBadgesProps) {
  if (capabilities.length === 0) {
    return null;
  }

  // Group capabilities by category for a cleaner display
  const simplifiedCapabilities = capabilities.map(cap => ({
    ...cap,
    displayName: cap.name.replace('Book ', '').replace('Send ', '').replace('Create ', '')
  }));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span className="text-sm text-muted-foreground">AI Capabilities</span>
      </div>
      
      {/* Show first few capabilities as badges */}
      <div className="flex items-center gap-2">
        {simplifiedCapabilities.slice(0, 3).map(cap => (
          <div
            key={cap.id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-700/50 border border-gray-600 text-xs text-gray-300"
          >
            {getCategoryIcon(cap.category)}
            <span>{cap.displayName}</span>
          </div>
        ))}
        
        {capabilities.length > 3 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-900/30 border border-purple-700 text-xs text-purple-400">
            <Brain className="h-4 w-4" />
            <span>AI Assistant</span>
          </div>
        )}
      </div>
    </div>
  );
}
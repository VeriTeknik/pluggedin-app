'use client';

import { 
  Briefcase,
  Calendar, 
  MessageSquare,
  Shield,
  Sparkles
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';

interface ChatCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface ChatCapabilitiesInlineProps {
  capabilities: ChatCapability[];
  className?: string;
}

const CAPABILITY_EXAMPLES: Record<string, string[]> = {
  'book_meeting': [
    '"Can we schedule a meeting next Tuesday?"',
    '"I need to book a call with you"',
    '"What times are you available this week?"'
  ],
  'check_availability': [
    '"Are you free tomorrow at 3pm?"',
    '"What\'s your schedule like next week?"',
    '"When can we meet?"'
  ],
  'send_email': [
    '"Can you send me the details via email?"',
    '"Please email me the information"',
    '"Send a follow-up email"'
  ],
  'send_slack': [
    '"Send me a message on Slack"',
    '"Can you notify the team?"',
    '"Post this to our Slack channel"'
  ],
  'create_lead': [
    '"I\'m interested in your services"',
    '"Add me to your CRM"',
    '"I want to become a customer"'
  ],
  'create_ticket': [
    '"I need help with an issue"',
    '"Can you create a support ticket?"',
    '"I have a problem that needs fixing"'
  ],
  'notify_team': [
    '"This is urgent, please notify someone"',
    '"Can you alert the team?"',
    '"I need immediate assistance"'
  ]
};

export function ChatCapabilitiesInline({ capabilities, className = '' }: ChatCapabilitiesInlineProps) {
  if (capabilities.length === 0) {
    return null;
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'calendar':
        return <Calendar className="h-3 w-3" />;
      case 'communication':
        return <MessageSquare className="h-3 w-3" />;
      case 'crm':
        return <Briefcase className="h-3 w-3" />;
      case 'support':
        return <Shield className="h-3 w-3" />;
      default:
        return <Sparkles className="h-3 w-3" />;
    }
  };

  // Get examples for enabled capabilities
  const examples: string[] = [];
  capabilities.forEach(cap => {
    const capExamples = CAPABILITY_EXAMPLES[cap.id];
    if (capExamples && capExamples.length > 0) {
      examples.push(capExamples[0]); // Take first example from each capability
    }
  });

  return (
    <div className={`bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="text-sm font-medium">Available Actions</span>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-3">
        {capabilities.map(cap => (
          <Badge key={cap.id} variant="secondary" className="text-xs">
            {getCategoryIcon(cap.category)}
            <span className="ml-1">{cap.name}</span>
          </Badge>
        ))}
      </div>

      {examples.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-100 dark:border-gray-600">
          <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
          <div className="space-y-1">
            {examples.slice(0, 3).map((example, index) => (
              <p key={index} className="text-xs italic text-muted-foreground">
                {example}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
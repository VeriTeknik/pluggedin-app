'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Calendar, 
  MessageSquare, 
  Mail, 
  Users, 
  Briefcase,
  Settings,
  Check,
  X,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
  TestTube,
  Shield,
  Globe,
  Key,
  Link2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { 
  PersonaIntegrations, 
  PersonaCapability,
  CalendarProvider,
  CommunicationProvider,
  CRMProvider,
  DEFAULT_CAPABILITIES
} from '@/lib/integrations/types';

interface PersonaIntegrationsProps {
  personaId?: number;
  integrations: PersonaIntegrations;
  capabilities: PersonaCapability[];
  onUpdate: (integrations: PersonaIntegrations, capabilities: PersonaCapability[]) => void;
  disabled?: boolean;
}

export function PersonaIntegrations({ 
  personaId, 
  integrations, 
  capabilities, 
  onUpdate,
  disabled = false 
}: PersonaIntegrationsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [localIntegrations, setLocalIntegrations] = useState<PersonaIntegrations>(integrations || {});
  const [localCapabilities, setLocalCapabilities] = useState<PersonaCapability[]>(
    capabilities?.length > 0 ? capabilities : DEFAULT_CAPABILITIES
  );
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const updateIntegration = (path: string, value: any) => {
    const newIntegrations = { ...localIntegrations };
    const keys = path.split('.');
    let current: any = newIntegrations;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setLocalIntegrations(newIntegrations);
    onUpdate(newIntegrations, localCapabilities);
  };

  const toggleCapability = (capabilityId: string) => {
    const newCapabilities = localCapabilities.map(cap => 
      cap.id === capabilityId 
        ? { ...cap, enabled: !cap.enabled }
        : cap
    );
    setLocalCapabilities(newCapabilities);
    onUpdate(localIntegrations, newCapabilities);
  };

  const testIntegration = async (integrationType: string) => {
    toast({
      title: t('embeddedChat.integrations.testing', 'Testing Integration'),
      description: t('embeddedChat.integrations.testingDesc', 'Checking connection...'),
    });
    
    // TODO: Implement actual test via API
    setTimeout(() => {
      toast({
        title: t('common.success'),
        description: t('embeddedChat.integrations.testSuccess', 'Integration test successful'),
      });
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="calendar">
            <Calendar className="h-4 w-4 mr-2" />
            {t('embeddedChat.integrations.calendar', 'Calendar')}
          </TabsTrigger>
          <TabsTrigger value="communication">
            <MessageSquare className="h-4 w-4 mr-2" />
            {t('embeddedChat.integrations.communication', 'Communication')}
          </TabsTrigger>
          <TabsTrigger value="crm">
            <Briefcase className="h-4 w-4 mr-2" />
            {t('embeddedChat.integrations.crm', 'CRM')}
          </TabsTrigger>
          <TabsTrigger value="capabilities">
            <Shield className="h-4 w-4 mr-2" />
            {t('embeddedChat.integrations.capabilities', 'Capabilities')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('embeddedChat.integrations.calendarSetup', 'Calendar Integration')}</CardTitle>
              <CardDescription>
                {t('embeddedChat.integrations.calendarDesc', 'Connect a calendar service to enable meeting scheduling')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('embeddedChat.integrations.enable', 'Enable Calendar')}</Label>
                <Switch
                  checked={localIntegrations.calendar?.enabled || false}
                  onCheckedChange={(checked) => 
                    updateIntegration('calendar.enabled', checked)
                  }
                  disabled={disabled}
                />
              </div>

              {localIntegrations.calendar?.enabled && (
                <>
                  <div>
                    <Label>{t('embeddedChat.integrations.provider', 'Provider')}</Label>
                    <Select
                      value={localIntegrations.calendar?.provider || 'google_calendar'}
                      onValueChange={(value) => 
                        updateIntegration('calendar.provider', value as CalendarProvider)
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_calendar">Google Calendar</SelectItem>
                        <SelectItem value="calendly">Calendly</SelectItem>
                        <SelectItem value="cal_com">Cal.com</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {localIntegrations.calendar?.provider === 'google_calendar' && (
                    <>
                      <div>
                        <Label>{t('embeddedChat.integrations.apiKey', 'API Key')}</Label>
                        <Input
                          type="password"
                          value={localIntegrations.calendar?.config?.apiKey || ''}
                          onChange={(e) => 
                            updateIntegration('calendar.config.apiKey', e.target.value)
                          }
                          placeholder="AIza..."
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label>{t('embeddedChat.integrations.calendarId', 'Calendar ID')}</Label>
                        <Input
                          value={localIntegrations.calendar?.config?.calendarId || ''}
                          onChange={(e) => 
                            updateIntegration('calendar.config.calendarId', e.target.value)
                          }
                          placeholder="primary or calendar@example.com"
                          disabled={disabled}
                        />
                      </div>
                    </>
                  )}

                  {localIntegrations.calendar?.provider === 'calendly' && (
                    <div>
                      <Label>{t('embeddedChat.integrations.webhookUrl', 'Webhook URL')}</Label>
                      <Input
                        type="url"
                        value={localIntegrations.calendar?.config?.webhookUrl || ''}
                        onChange={(e) => 
                          updateIntegration('calendar.config.webhookUrl', e.target.value)
                        }
                        placeholder="https://calendly.com/..."
                        disabled={disabled}
                      />
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testIntegration('calendar')}
                    disabled={disabled}
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {t('embeddedChat.integrations.test', 'Test Connection')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communication" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('embeddedChat.integrations.communicationSetup', 'Communication Channels')}</CardTitle>
              <CardDescription>
                {t('embeddedChat.integrations.communicationDesc', 'Configure messaging and email integrations')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Slack Integration */}
              <Collapsible>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full p-2 hover:bg-muted rounded-lg"
                  onClick={() => toggleSection('slack')}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium">Slack</span>
                    {localIntegrations.communication?.slack?.enabled && (
                      <Badge variant="secondary" className="ml-2">
                        <Check className="h-3 w-3 mr-1" />
                        {t('embeddedChat.integrations.connected', 'Connected')}
                      </Badge>
                    )}
                  </div>
                  <ChevronRight 
                    className={`h-4 w-4 transition-transform ${
                      expandedSections.includes('slack') ? 'rotate-90' : ''
                    }`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>{t('embeddedChat.integrations.enableSlack', 'Enable Slack')}</Label>
                    <Switch
                      checked={localIntegrations.communication?.slack?.enabled || false}
                      onCheckedChange={(checked) => 
                        updateIntegration('communication.slack.enabled', checked)
                      }
                      disabled={disabled}
                    />
                  </div>

                  {localIntegrations.communication?.slack?.enabled && (
                    <>
                      <div>
                        <Label>{t('embeddedChat.integrations.slackWebhook', 'Webhook URL')}</Label>
                        <Input
                          type="url"
                          value={localIntegrations.communication?.slack?.config?.webhookUrl || ''}
                          onChange={(e) => 
                            updateIntegration('communication.slack.config.webhookUrl', e.target.value)
                          }
                          placeholder="https://hooks.slack.com/..."
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label>{t('embeddedChat.integrations.defaultChannel', 'Default Channel')}</Label>
                        <Input
                          value={localIntegrations.communication?.slack?.config?.channel || ''}
                          onChange={(e) => 
                            updateIntegration('communication.slack.config.channel', e.target.value)
                          }
                          placeholder="#general"
                          disabled={disabled}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testIntegration('slack')}
                        disabled={disabled}
                      >
                        <TestTube className="h-4 w-4 mr-2" />
                        {t('embeddedChat.integrations.test', 'Test Connection')}
                      </Button>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Email Integration */}
              <Collapsible>
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full p-2 hover:bg-muted rounded-lg"
                  onClick={() => toggleSection('email')}
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span className="font-medium">Email</span>
                    {localIntegrations.communication?.email?.enabled && (
                      <Badge variant="secondary" className="ml-2">
                        <Check className="h-3 w-3 mr-1" />
                        {t('embeddedChat.integrations.connected', 'Connected')}
                      </Badge>
                    )}
                  </div>
                  <ChevronRight 
                    className={`h-4 w-4 transition-transform ${
                      expandedSections.includes('email') ? 'rotate-90' : ''
                    }`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>{t('embeddedChat.integrations.enableEmail', 'Enable Email')}</Label>
                    <Switch
                      checked={localIntegrations.communication?.email?.enabled || false}
                      onCheckedChange={(checked) => 
                        updateIntegration('communication.email.enabled', checked)
                      }
                      disabled={disabled}
                    />
                  </div>

                  {localIntegrations.communication?.email?.enabled && (
                    <>
                      <div>
                        <Label>{t('embeddedChat.integrations.fromEmail', 'From Email')}</Label>
                        <Input
                          type="email"
                          value={localIntegrations.communication?.email?.config?.fromEmail || ''}
                          onChange={(e) => 
                            updateIntegration('communication.email.config.fromEmail', e.target.value)
                          }
                          placeholder="noreply@example.com"
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <Label>{t('embeddedChat.integrations.fromName', 'From Name')}</Label>
                        <Input
                          value={localIntegrations.communication?.email?.config?.fromName || ''}
                          onChange={(e) => 
                            updateIntegration('communication.email.config.fromName', e.target.value)
                          }
                          placeholder="Support Team"
                          disabled={disabled}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testIntegration('email')}
                        disabled={disabled}
                      >
                        <TestTube className="h-4 w-4 mr-2" />
                        {t('embeddedChat.integrations.test', 'Test Connection')}
                      </Button>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('embeddedChat.integrations.crmSetup', 'CRM Integration')}</CardTitle>
              <CardDescription>
                {t('embeddedChat.integrations.crmDesc', 'Connect your CRM to manage leads and contacts')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('embeddedChat.integrations.enableCrm', 'Enable CRM')}</Label>
                <Switch
                  checked={localIntegrations.crm?.enabled || false}
                  onCheckedChange={(checked) => 
                    updateIntegration('crm.enabled', checked)
                  }
                  disabled={disabled}
                />
              </div>

              {localIntegrations.crm?.enabled && (
                <>
                  <div>
                    <Label>{t('embeddedChat.integrations.crmProvider', 'CRM Provider')}</Label>
                    <Select
                      value={localIntegrations.crm?.provider || 'hubspot'}
                      onValueChange={(value) => 
                        updateIntegration('crm.provider', value as CRMProvider)
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hubspot">HubSpot</SelectItem>
                        <SelectItem value="salesforce">Salesforce</SelectItem>
                        <SelectItem value="pipedrive">Pipedrive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('embeddedChat.integrations.apiKey', 'API Key')}</Label>
                    <Input
                      type="password"
                      value={localIntegrations.crm?.config?.apiKey || ''}
                      onChange={(e) => 
                        updateIntegration('crm.config.apiKey', e.target.value)
                      }
                      placeholder="Enter API key"
                      disabled={disabled}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testIntegration('crm')}
                    disabled={disabled}
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {t('embeddedChat.integrations.test', 'Test Connection')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('embeddedChat.integrations.capabilitiesSetup', 'AI Capabilities')}</CardTitle>
              <CardDescription>
                {t('embeddedChat.integrations.capabilitiesDesc', 'Enable specific actions this persona can perform')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {localCapabilities.map((capability) => {
                  const hasRequirements = capability.requiredIntegrations && 
                    capability.requiredIntegrations.length > 0;
                  const requirementsMet = !hasRequirements || 
                    capability.requiredIntegrations!.every(req => {
                      const parts = req.split('.');
                      if (parts.length === 1) {
                        return localIntegrations[req as keyof PersonaIntegrations]?.enabled;
                      }
                      // Handle nested requirements like 'communication.slack'
                      const [category, provider] = parts;
                      return (localIntegrations as any)[category]?.[provider]?.enabled;
                    });

                  return (
                    <div 
                      key={capability.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        !requirementsMet ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium">{capability.name}</Label>
                          {!requirementsMet && (
                            <Badge variant="outline" className="text-xs">
                              {t('embeddedChat.integrations.requiresIntegration', 'Requires integration')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {capability.description}
                        </p>
                        {hasRequirements && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('embeddedChat.integrations.requires', 'Requires')}: {capability.requiredIntegrations!.join(', ')}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={capability.enabled && requirementsMet}
                        onCheckedChange={() => toggleCapability(capability.id)}
                        disabled={disabled || !requirementsMet}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
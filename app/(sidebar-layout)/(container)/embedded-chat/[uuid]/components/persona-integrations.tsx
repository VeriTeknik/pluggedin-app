'use client';

import { 
  Briefcase,
  Calendar, 
  Check,
  ChevronRight,
  Link2,
  Mail, 
  MessageSquare,
  Shield,
  TestTube} from 'lucide-react';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarProvider,
  CRMProvider,
  DEFAULT_CAPABILITIES,
  PersonaCapability,
  type PersonaIntegrations} from '@/lib/integrations/types';

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
  const [connectionStatus, setConnectionStatus] = useState<any>({});

  useEffect(() => {
    if (personaId) {
      checkConnectionStatus();
    }
    
    // Check for success message from OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'true') {
      toast({
        title: t('common.success'),
        description: t('embeddedChat.integrations.calendarConnected', 'Google Calendar connected successfully'),
      });
      // Remove the query parameter from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    // Listen for popup OAuth completion (postMessage)
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from same origin
      if (event.origin !== window.location.origin) return;
      const data = event.data as any;
      if (data && data.source === 'pluggedin' && data.type === 'google-calendar-oauth-complete') {
        if (data.success) {
          toast({
            title: t('common.success'),
            description: t('embeddedChat.integrations.calendarConnected', 'Google Calendar connected successfully'),
          });
          checkConnectionStatus();
        } else {
          toast({
            title: t('common.error'),
            description: t('embeddedChat.integrations.disconnectFailed', 'Failed to connect Google Calendar'),
            variant: 'destructive',
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [personaId, toast, t]);

  const checkConnectionStatus = async () => {
    if (!personaId) return;
    
    try {
      const chatUuid = window.location.pathname.split('/')[2];
      const response = await fetch(`/api/embedded-chat/${chatUuid}/persona/${personaId}/integration`);
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus(data.status || {});
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    }
  };

  const connectGoogleCalendar = async () => {
    // Extract chat UUID and persona ID from current URL
    const pathParts = window.location.pathname.split('/');
    const chatUuid = pathParts[2]; // embedded-chat/[uuid]
    
    // Build the authorization URL with parameters
    const params = new URLSearchParams({
      redirect: window.location.pathname,
      personaId: personaId?.toString() || '',
      chatUuid: chatUuid || '',
      popup: '1',
    });
    const authUrl = `/api/auth/google-calendar/authorize?${params.toString()}`;

    // Open popup; if blocked, fall back to redirect
    const popup = window.open(
      authUrl,
      'google_calendar_oauth',
      'width=520,height=640,menubar=no,toolbar=no,location=no,status=no'
    );
    if (!popup || popup.closed) {
      // Fallback to full redirect
      window.location.href = authUrl;
    }
  };

  const disconnectGoogleCalendar = async () => {
    try {
      const response = await fetch('/api/auth/google-calendar/disconnect', {
        method: 'POST',
      });
      
      if (response.ok) {
        toast({
          title: t('common.success'),
          description: t('embeddedChat.integrations.googleDisconnected', 'Google account disconnected. You can now reconnect with calendar permissions.'),
        });
        // Refresh the connection status
        checkConnectionStatus();
      } else {
        toast({
          title: t('common.error'),
          description: t('embeddedChat.integrations.disconnectFailed', 'Failed to disconnect Google account'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('embeddedChat.integrations.disconnectError', 'Error disconnecting Google account'),
        variant: 'destructive',
      });
    }
  };

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
    if (!personaId) {
      toast({
        title: t('common.error'),
        description: t('embeddedChat.integrations.saveFirst', 'Please save the persona first'),
        variant: 'destructive',
      });
      return;
    }

    // Get the current local integration configuration
    let integrationConfig = null;
    switch (integrationType) {
      case 'slack':
        integrationConfig = localIntegrations.communication?.slack;
        break;
      case 'email':
        integrationConfig = localIntegrations.communication?.email;
        break;
      case 'calendar':
        integrationConfig = localIntegrations.calendar;
        break;
      case 'crm':
        integrationConfig = localIntegrations.crm;
        break;
    }

    // Check if the integration is configured locally
    if (!integrationConfig?.enabled) {
      toast({
        title: t('common.error'),
        description: t('embeddedChat.integrations.notConfigured', `${integrationType} integration is not enabled`),
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: t('embeddedChat.integrations.testing', 'Testing Integration'),
      description: t('embeddedChat.integrations.testingDesc', 'Checking connection...'),
    });
    
    try {
      const chatUuid = window.location.pathname.split('/')[2]; // Extract from URL
      const response = await fetch(`/api/embedded-chat/${chatUuid}/persona/${personaId}/integration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          integration: integrationType,
          // Include the current local configuration for testing
          localConfig: integrationConfig,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: t('common.success'),
          description: result.data?.message || t('embeddedChat.integrations.testSuccess', 'Integration test successful'),
        });
      } else {
        toast({
          title: t('common.error'),
          description: result.error || t('embeddedChat.integrations.testFailed', 'Integration test failed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('embeddedChat.integrations.testError', 'Failed to test integration'),
        variant: 'destructive',
      });
    }
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
                  onCheckedChange={(checked) => {
                    updateIntegration('calendar.enabled', checked);
                    if (checked && !localIntegrations.calendar?.provider) {
                      updateIntegration('calendar.provider', 'google_calendar');
                    }
                    // Auto-enable calendar capabilities
                    const caps = localCapabilities.map(c =>
                      ['schedule_meeting', 'check_availability'].includes(c.id)
                        ? { ...c, enabled: checked || c.enabled }
                        : c
                    );
                    setLocalCapabilities(caps);
                    onUpdate(localIntegrations, caps);
                  }}
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
                </>
              )}

              {/* Show Google Calendar connection status regardless of enabled state */}
              {(localIntegrations.calendar?.provider || 'google_calendar') === 'google_calendar' && (
                    <>
                      {connectionStatus.googleCalendar?.connected && connectionStatus.googleCalendar?.hasRequiredScopes ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">
                              {t('embeddedChat.integrations.googleConnected', 'Google Calendar connected')}
                            </span>
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
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('embeddedChat.integrations.calendarIdHint', 'Leave empty to use primary calendar')}
                            </p>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={connectGoogleCalendar}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            {t('embeddedChat.integrations.reconnectCalendar', 'Reconnect Google Calendar')}
                          </Button>
                        </div>
                      ) : connectionStatus.googleCalendar?.connected && !connectionStatus.googleCalendar?.hasRequiredScopes ? (
                        <div className="space-y-4">
                          <div className="p-4 border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                              {t('embeddedChat.integrations.insufficientPermissions', 'Google account is connected but lacks calendar permissions. Please disconnect and reconnect to grant the required permissions.')}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={disconnectGoogleCalendar}
                                disabled={disabled}
                              >
                                {t('embeddedChat.integrations.disconnect', 'Disconnect Google')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={connectGoogleCalendar}
                                disabled={disabled}
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                {t('embeddedChat.integrations.grantPermissions', 'Grant Calendar Permissions')}
                              </Button>
                            </div>
                          </div>
                          
                          {connectionStatus.googleCalendar?.missingScopes && connectionStatus.googleCalendar.missingScopes.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <p>{t('embeddedChat.integrations.missingScopes', 'Missing permissions:')}</p>
                              <ul className="list-disc list-inside mt-1">
                                {connectionStatus.googleCalendar.missingScopes.map((scope: string) => (
                                  <li key={scope}>{scope.replace('.', ' ').replace('calendar ', 'Calendar: ')}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 border-2 border-dashed rounded-lg">
                            <p className="text-sm text-muted-foreground mb-3">
                              {t('embeddedChat.integrations.googleCalendarNotConnected', 'Grant calendar permissions to enable meeting scheduling')}
                            </p>
                            <Button
                              onClick={connectGoogleCalendar}
                              disabled={disabled}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              {t('embeddedChat.integrations.connectGoogleCalendar', 'Connect Google Calendar')}
                            </Button>
                          </div>
                          
                          <div className="text-xs text-muted-foreground">
                            <p>{t('embeddedChat.integrations.calendarPermissions', 'This will request permission to:')}</p>
                            <ul className="list-disc list-inside mt-1">
                              <li>{t('embeddedChat.integrations.permissionAppCreated', 'Create a dedicated calendar for this app')}</li>
                              <li>{t('embeddedChat.integrations.permissionCalendarList', 'View your calendar list')}</li>
                              <li>{t('embeddedChat.integrations.permissionFreeBusy', 'Check free/busy availability')}</li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </>
              )}

              {localIntegrations.calendar?.enabled && localIntegrations.calendar?.provider === 'calendly' && (
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

              {localIntegrations.calendar?.enabled && 
                ((localIntegrations.calendar?.provider === 'google_calendar' && connectionStatus.googleCalendar?.connected) ||
                  localIntegrations.calendar?.provider !== 'google_calendar') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testIntegration('calendar')}
                      disabled={disabled}
                    >
                      <TestTube className="h-4 w-4 mr-2" />
                      {t('embeddedChat.integrations.test', 'Test Connection')}
                    </Button>
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
                      onCheckedChange={(checked) => {
                        updateIntegration('communication.slack.enabled', checked);
                        // Auto-enable Slack capability
                        const caps = localCapabilities.map(c =>
                          c.id === 'send_slack' ? { ...c, enabled: checked || c.enabled } : c
                        );
                        setLocalCapabilities(caps);
                        onUpdate(localIntegrations, caps);
                      }}
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
                      onCheckedChange={(checked) => {
                        updateIntegration('communication.email.enabled', checked);
                        // Auto-enable Email capability
                        const caps = localCapabilities.map(c =>
                          c.id === 'send_email' ? { ...c, enabled: checked || c.enabled } : c
                        );
                        setLocalCapabilities(caps);
                        onUpdate(localIntegrations, caps);
                      }}
                      disabled={disabled}
                    />
                  </div>

                  {localIntegrations.communication?.email?.enabled && (
                    <>
                      <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                        <p>{t('embeddedChat.integrations.emailFromInfo', 'Emails will be sent from Plugged.in system email. The authenticated user and persona information will be included in the email content.')}</p>
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
                        const integration = localIntegrations[req as keyof PersonaIntegrations];
                        return integration && 'enabled' in integration ? integration.enabled : false;
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
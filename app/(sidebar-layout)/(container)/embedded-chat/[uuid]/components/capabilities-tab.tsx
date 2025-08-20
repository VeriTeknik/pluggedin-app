'use client';

import { 
  Briefcase,
  Calendar, 
  Check,
  Globe, 
  MessageSquare,
  Search,
  Shield,
  User,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getEmbeddedChatConfig,
  updateChatPersona,
} from '@/app/actions/embedded-chat';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  DEFAULT_CAPABILITIES,
  PersonaCapability,
  PersonaIntegrations
} from '@/lib/integrations/types';
import { EmbeddedChat } from '@/types/embedded-chat';

interface Persona {
  id: number;
  name: string;
  role?: string;
  avatar_url?: string;
  integrations?: PersonaIntegrations;
  capabilities?: PersonaCapability[];
  is_active: boolean;
  is_default: boolean;
}

interface CapabilitiesTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function CapabilitiesTab({ chat, chatUuid }: CapabilitiesTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPersona, setSelectedPersona] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadPersonas();
  }, [chatUuid]);

  const loadPersonas = async () => {
    try {
      const result = await getEmbeddedChatConfig(chatUuid);
      if (result.success && result.data?.personas) {
        // Ensure all fields have proper defaults
        const personas = result.data.personas.map((p: any) => ({
          ...p,
          is_active: p.is_active ?? true,
          is_default: p.is_default ?? false,
          display_order: p.display_order ?? 0,
        }));
        setPersonas(personas);
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: 'Failed to load personas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
        return <Globe className="h-4 w-4" />;
    }
  };

  const getCapabilityStatus = (capabilityId: string): { personas: Persona[], enabled: boolean } => {
    const enabledPersonas = personas.filter(persona => {
      const capabilities = persona.capabilities || [];
      return capabilities.some(c => c.id === capabilityId && c.enabled);
    });
    
    return {
      personas: enabledPersonas,
      enabled: enabledPersonas.length > 0
    };
  };

  const toggleCapabilityForPersona = async (personaId: number, capabilityId: string, enabled: boolean) => {
    setIsUpdating(true);
    try {
      const persona = personas.find(p => p.id === personaId);
      if (!persona) return;

      const capabilities = persona.capabilities?.length > 0 
        ? [...persona.capabilities]
        : [...DEFAULT_CAPABILITIES];
      
      const capabilityIndex = capabilities.findIndex(c => c.id === capabilityId);
      if (capabilityIndex !== -1) {
        capabilities[capabilityIndex] = {
          ...capabilities[capabilityIndex],
          enabled
        };
      }

      const result = await updateChatPersona(chatUuid, personaId, {
        capabilities
      });

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('embeddedChat.capabilities.updated', 'Capability updated successfully'),
        });
        await loadPersonas();
      } else {
        throw new Error(result.error || 'Failed to update capability');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to update capability',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const checkIntegrationRequirements = (persona: Persona, requirements?: string[]) => {
    if (!requirements || requirements.length === 0) return true;
    
    const integrations = persona.integrations || {};
    
    return requirements.every(req => {
      const parts = req.split('.');
      if (parts.length === 1) {
        return (integrations as any)[req]?.enabled;
      }
      const [category, provider] = parts;
      return (integrations as any)[category]?.[provider]?.enabled;
    });
  };

  // Get unique categories
  const categories = Array.from(new Set(DEFAULT_CAPABILITIES.map(c => c.category)));
  
  // Filter capabilities based on search and category
  const filteredCapabilities = DEFAULT_CAPABILITIES.filter(capability => {
    const matchesSearch = !searchQuery || 
      capability.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      capability.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || capability.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Filter personas for display
  const displayPersonas = selectedPersona === 'all' 
    ? personas 
    : personas.filter(p => p.id === parseInt(selectedPersona));

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.capabilities.title', 'AI Capabilities')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.capabilities.description', 'Manage what actions your AI personas can perform')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={t('embeddedChat.capabilities.search', 'Search capabilities...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* Category Filter */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('embeddedChat.capabilities.allCategories', 'All Categories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('embeddedChat.capabilities.allCategories', 'All Categories')}</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      <span className="capitalize">{category}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Persona Filter */}
            <Select value={selectedPersona} onValueChange={setSelectedPersona}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('embeddedChat.capabilities.allPersonas', 'All Personas')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('embeddedChat.capabilities.allPersonas', 'All Personas')}</SelectItem>
                {personas.map(persona => (
                  <SelectItem key={persona.id} value={persona.id.toString()}>
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      {persona.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Capabilities Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCapabilities.map(capability => {
          const status = getCapabilityStatus(capability.id);
          
          return (
            <Card key={capability.id} className={!status.enabled ? 'opacity-75' : ''}>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(capability.category)}
                    <CardTitle className="text-base">{capability.name}</CardTitle>
                  </div>
                  {status.enabled && (
                    <Badge variant="default" className="ml-2">
                      <Check className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {capability.description}
                </p>
                
                {capability.requiredIntegrations && capability.requiredIntegrations.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">{t('embeddedChat.capabilities.requires', 'Requires')}:</span> {capability.requiredIntegrations.join(', ')}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    {t('embeddedChat.capabilities.enabledFor', 'Enabled for')}:
                  </Label>
                  <div className="space-y-2">
                    {displayPersonas.map(persona => {
                      const capabilities = persona.capabilities?.length > 0 
                        ? persona.capabilities 
                        : DEFAULT_CAPABILITIES;
                      const personaCapability = capabilities.find(c => c.id === capability.id);
                      const isEnabled = personaCapability?.enabled || false;
                      const requirementsMet = checkIntegrationRequirements(persona, capability.requiredIntegrations);
                      
                      return (
                        <div 
                          key={persona.id} 
                          className={`flex items-center justify-between p-2 rounded-lg border ${
                            !requirementsMet ? 'opacity-50' : ''
                          } ${!persona.is_active ? 'bg-muted/50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            <span className="text-sm">{persona.name}</span>
                            {!persona.is_active && (
                              <Badge variant="outline" className="text-xs">Inactive</Badge>
                            )}
                            {!requirementsMet && (
                              <Badge variant="outline" className="text-xs">
                                <X className="h-2 w-2 mr-1" />
                                Missing integration
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={isEnabled && requirementsMet}
                            onCheckedChange={(checked) => toggleCapabilityForPersona(persona.id, capability.id, checked)}
                            disabled={isUpdating || !requirementsMet || !persona.is_active}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('embeddedChat.capabilities.summary', 'Summary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('embeddedChat.capabilities.totalCapabilities', 'Total Capabilities')}</p>
              <p className="text-2xl font-bold">{DEFAULT_CAPABILITIES.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('embeddedChat.capabilities.activeCapabilities', 'Active Capabilities')}</p>
              <p className="text-2xl font-bold">
                {DEFAULT_CAPABILITIES.filter(c => getCapabilityStatus(c.id).enabled).length}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('embeddedChat.capabilities.activePersonas', 'Active Personas')}</p>
              <p className="text-2xl font-bold">{personas.filter(p => p.is_active).length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
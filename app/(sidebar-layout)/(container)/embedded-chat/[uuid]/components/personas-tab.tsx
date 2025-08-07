'use client';

import { Briefcase,Calendar, Edit, GripVertical, Mail, MessageSquare, Phone, Plus, Settings2, Star, Trash2, User } from 'lucide-react';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createChatPersona,
  deleteChatPersona,
  getEmbeddedChatConfig,
  updateChatPersona,
} from '@/app/actions/embedded-chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PersonaCapability,PersonaIntegrations as PersonaIntegrationsType } from '@/lib/integrations/types';
import { EmbeddedChat } from '@/types/embedded-chat';

import { PersonaIntegrations } from './persona-integrations';

interface Persona {
  id: number;
  embedded_chat_uuid: string;
  name: string;
  role?: string | null;
  instructions: string;
  avatar_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_calendar_link?: string | null;
  integrations?: PersonaIntegrationsType;
  capabilities?: PersonaCapability[];
  tools_config?: any;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface PersonasTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function PersonasTab({ chat, chatUuid }: PersonasTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    instructions: '',
    avatar_url: '',
    contact_email: '',
    contact_phone: '',
    integrations: {} as PersonaIntegrationsType,
    capabilities: [] as PersonaCapability[],
    is_active: true,
    is_default: false,
  });

  // Load personas on mount
  useEffect(() => {
    loadPersonas();
  }, [chatUuid]);

  const loadPersonas = async () => {
    setIsLoading(true);
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

  const handleOpenDialog = (persona?: Persona) => {
    if (persona) {
      setEditingPersona(persona);
      setFormData({
        name: persona.name,
        role: persona.role || '',
        instructions: persona.instructions,
        avatar_url: persona.avatar_url || '',
        contact_email: persona.contact_email || '',
        contact_phone: persona.contact_phone || '',
        integrations: persona.integrations || {},
        capabilities: persona.capabilities || [],
        is_active: persona.is_active,
        is_default: persona.is_default,
      });
    } else {
      setEditingPersona(null);
      setFormData({
        name: '',
        role: '',
        instructions: '',
        avatar_url: '',
        contact_email: '',
        contact_phone: '',
        integrations: {},
        capabilities: [],
        is_active: true,
        is_default: personas.length === 0, // First persona is default
      });
    }
    setIsDialogOpen(true);
  };

  const handleSavePersona = async () => {
    if (!formData.name.trim() || !formData.instructions.trim()) {
      toast({
        title: t('common.error'),
        description: 'Name and instructions are required',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const personaData = {
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        instructions: formData.instructions.trim(),
        avatar_url: formData.avatar_url.trim() || undefined,
        contact_email: formData.contact_email.trim() || undefined,
        contact_phone: formData.contact_phone.trim() || undefined,
        integrations: formData.integrations,
        capabilities: formData.capabilities,
        is_active: formData.is_active,
        is_default: formData.is_default,
        display_order: editingPersona?.display_order ?? personas.length,
      };

      let result;
      if (editingPersona) {
        result = await updateChatPersona(chatUuid, editingPersona.id, personaData);
      } else {
        result = await createChatPersona(chatUuid, personaData);
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to save persona');
      }

      toast({
        title: t('common.success'),
        description: editingPersona 
          ? t('embeddedChat.personas.updateSuccess', 'Persona updated successfully')
          : t('embeddedChat.personas.createSuccess', 'Persona created successfully'),
      });
      
      setIsDialogOpen(false);
      await loadPersonas(); // Reload personas
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to save persona',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePersona = async (persona: Persona) => {
    if (!confirm(t('embeddedChat.personas.deleteConfirm', 'Are you sure you want to delete this persona?'))) {
      return;
    }

    try {
      const result = await deleteChatPersona(chatUuid, persona.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete persona');
      }

      toast({
        title: t('common.success'),
        description: t('embeddedChat.personas.deleteSuccess', 'Persona deleted successfully'),
      });
      
      await loadPersonas();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to delete persona',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (persona: Persona) => {
    try {
      const result = await updateChatPersona(chatUuid, persona.id, {
        is_active: !persona.is_active,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update persona');
      }
      
      await loadPersonas();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to update persona',
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (persona: Persona) => {
    try {
      const result = await updateChatPersona(chatUuid, persona.id, {
        is_default: true,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to set default persona');
      }
      
      toast({
        title: t('common.success'),
        description: t('embeddedChat.personas.setDefaultSuccess', 'Default persona updated'),
      });
      
      await loadPersonas();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to set default persona',
        variant: 'destructive',
      });
    }
  };

  const handleReorder = async (personaId: number, newOrder: number) => {
    // TODO: Implement drag-and-drop reordering
    // For now, this is a placeholder
    console.log('Reorder persona', personaId, 'to position', newOrder);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('embeddedChat.personas.title', 'Personas')}</CardTitle>
              <CardDescription>
                {t('embeddedChat.personas.description', 'Manage different AI personalities for your chat')}
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('embeddedChat.personas.addPersona', 'Add Persona')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : personas.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">
                {t('embeddedChat.personas.noPersonas', 'No personas configured yet')}
              </p>
              <Button onClick={() => handleOpenDialog()} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                {t('embeddedChat.personas.createFirst', 'Create Your First Persona')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {personas.sort((a, b) => a.display_order - b.display_order).map((persona) => (
                <div
                  key={persona.id}
                  className={`border rounded-lg p-4 ${!persona.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Drag Handle (placeholder for now) */}
                    <div className="mt-2 cursor-move opacity-50 hover:opacity-100">
                      <GripVertical className="h-5 w-5" />
                    </div>
                    
                    {/* Avatar */}
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={persona.avatar_url || undefined} />
                      <AvatarFallback>
                        {persona.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{persona.name}</h4>
                        {persona.role && (
                          <Badge variant="secondary">{persona.role}</Badge>
                        )}
                        {persona.is_default && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                        {!persona.is_active && (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {persona.instructions}
                      </p>
                      
                      {/* Integration Status */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {persona.contact_email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {persona.contact_email}
                          </div>
                        )}
                        {persona.contact_phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {persona.contact_phone}
                          </div>
                        )}
                        {persona.integrations?.calendar?.enabled && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {persona.integrations.calendar.provider?.replace('_', ' ')}
                          </div>
                        )}
                        {persona.integrations?.communication?.slack?.enabled && (
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            Slack
                          </div>
                        )}
                        {persona.integrations?.crm?.enabled && (
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {persona.integrations.crm.provider}
                          </div>
                        )}
                        {persona.capabilities?.filter(c => c.enabled).length > 0 && (
                          <Badge variant="outline" className="ml-2">
                            {persona.capabilities.filter(c => c.enabled).length} capabilities
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={persona.is_active}
                        onCheckedChange={() => handleToggleActive(persona)}
                      />
                      {!persona.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSetDefault(persona)}
                          title={t('embeddedChat.personas.setAsDefault', 'Set as default')}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(persona)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePersona(persona)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPersona 
                ? t('embeddedChat.personas.editPersona', 'Edit Persona')
                : t('embeddedChat.personas.createPersona', 'Create New Persona')}
            </DialogTitle>
            <DialogDescription>
              {t('embeddedChat.personas.dialogDescription', 'Configure how this AI persona behaves and presents itself')}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">
                {t('embeddedChat.personas.basicInfo', 'Basic Info')}
              </TabsTrigger>
              <TabsTrigger value="integrations">
                <Settings2 className="h-4 w-4 mr-2" />
                {t('embeddedChat.personas.integrations', 'Integrations')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    {t('embeddedChat.personas.name', 'Name')} *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Support Agent"
                  />
                </div>
                <div>
                  <Label htmlFor="role">
                    {t('embeddedChat.personas.role', 'Role')}
                  </Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="Customer Support"
                  />
                </div>
              </div>

              {/* Instructions */}
              <div>
                <Label htmlFor="instructions">
                  {t('embeddedChat.personas.instructions', 'Instructions')} *
                </Label>
                <Textarea
                  id="instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder="You are a helpful customer support agent..."
                  rows={4}
                />
              </div>

              {/* Avatar */}
              <div className="space-y-2">
                <Label>{t('embeddedChat.personas.avatar', 'Avatar')}</Label>
                <AvatarUpload
                  currentAvatarUrl={formData.avatar_url}
                  onAvatarChange={(url) => setFormData({ ...formData, avatar_url: url })}
                  uploadEndpoint={editingPersona 
                    ? `/api/embedded-chat/${chatUuid}/persona/${editingPersona.id}/avatar`
                    : undefined}
                  name={formData.name || 'Persona'}
                  size="md"
                />
                {!editingPersona && (
                  <p className="text-xs text-muted-foreground">
                    {t('embeddedChat.personas.avatarNote', 'You can upload an avatar after creating the persona')}
                  </p>
                )}
              </div>

              {/* Contact Information */}
              <div className="space-y-2">
                <Label>{t('embeddedChat.personas.contactInfo', 'Contact Information')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contact_email" className="text-sm">
                      {t('embeddedChat.personas.email', 'Email')}
                    </Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      placeholder="support@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact_phone" className="text-sm">
                      {t('embeddedChat.personas.phone', 'Phone')}
                    </Label>
                    <Input
                      id="contact_phone"
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t('embeddedChat.personas.active', 'Active')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.personas.activeDescription', 'Enable this persona for use')}
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t('embeddedChat.personas.default', 'Default')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.personas.defaultDescription', 'Use this persona by default')}
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_default}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="integrations" className="mt-4">
              <PersonaIntegrations
                personaId={editingPersona?.id}
                integrations={formData.integrations}
                capabilities={formData.capabilities}
                onUpdate={(integrations, capabilities) => 
                  setFormData({ ...formData, integrations, capabilities })
                }
                disabled={!editingPersona}
              />
              {!editingPersona && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('embeddedChat.personas.saveToConfigureIntegrations', 'Save the persona first to configure integrations')}
                </p>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSavePersona} disabled={isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
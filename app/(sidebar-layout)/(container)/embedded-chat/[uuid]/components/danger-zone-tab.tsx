'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';
import { deleteEmbeddedChat } from '@/app/actions/embedded-chat';

interface DangerZoneTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function DangerZoneTab({ chat, chatUuid }: DangerZoneTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteEmbeddedChat(chatUuid);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete embedded chat');
      }

      toast({
        title: t('common.success'),
        description: t('embeddedChat.dangerZone.deleteSuccess', 'Embedded chat has been permanently deleted'),
      });

      // Redirect to embedded chat list
      router.push('/embedded-chat');
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to delete embedded chat',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('embeddedChat.dangerZone.title', 'Danger Zone')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.dangerZone.description', 'Irreversible and destructive actions')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t('embeddedChat.dangerZone.deleteTitle', 'Delete Embedded Chat')}
            </h3>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-destructive">
                {t('embeddedChat.dangerZone.warning', 'This action cannot be undone!')}
              </p>
              <p>
                {t('embeddedChat.dangerZone.deleteDescription', 
                  'Permanently delete this embedded chat and all associated data including:'
                )}
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>{t('embeddedChat.dangerZone.deleteItem1', 'All chat conversations and messages')}</li>
                <li>{t('embeddedChat.dangerZone.deleteItem2', 'All visitor contact information')}</li>
                <li>{t('embeddedChat.dangerZone.deleteItem3', 'All chat personas and configurations')}</li>
                <li>{t('embeddedChat.dangerZone.deleteItem4', 'All analytics and usage data')}</li>
                <li>{t('embeddedChat.dangerZone.deleteItem5', 'All API keys and integrations')}</li>
              </ul>
              <p className="mt-2 font-medium">
                {t('embeddedChat.dangerZone.gdprNote', 
                  'This deletion is GDPR compliant and will remove all personal data associated with this chat.'
                )}
              </p>
            </div>

            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('embeddedChat.dangerZone.deleteButton', 'Delete Embedded Chat')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('embeddedChat.dangerZone.confirmTitle', 'Delete Embedded Chat?')}
        description={t('embeddedChat.dangerZone.confirmDescription', {
          chatName: chat.name,
          defaultValue: `Are you sure you want to delete "${chat.name}"? This will permanently delete all conversations, messages, and associated data. This action cannot be undone.`
        })}
        confirmText={t('embeddedChat.dangerZone.confirmButton', 'Delete Permanently')}
        cancelText={t('common.cancel', 'Cancel')}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        variant="destructive"
      />
    </>
  );
}
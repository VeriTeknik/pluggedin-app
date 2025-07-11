'use client';

import { Activity, Database, Globe, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { McpServer } from '@/types/mcp-server';

interface ServerStatsProps {
  servers: McpServer[];
}

export function ServerStats({ servers }: ServerStatsProps) {
  const { t } = useTranslation();
  const activeServers = servers.filter(s => s.status === McpServerStatus.ACTIVE).length;
  const stdioServers = servers.filter(s => s.type === McpServerType.STDIO).length;
  const streamableServers = servers.filter(s => s.type === McpServerType.SSE || s.type === McpServerType.STREAMABLE_HTTP).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
      <Card className="bg-white/50 dark:bg-slate-900/70 dark:border-slate-800">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{t('mcpServers.stats.totalServers', 'Total Servers')}</p>
            <p className="text-2xl font-bold">{servers.length}</p>
          </div>
          <Database className="h-8 w-8 text-indigo-500/50 dark:text-indigo-400/50" />
        </CardContent>
      </Card>
      
      <Card className="bg-white/50 dark:bg-slate-900/70 dark:border-slate-800">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{t('mcpServers.stats.active', 'Active')}</p>
            <p className="text-2xl font-bold">{activeServers}</p>
          </div>
          <Activity className="h-8 w-8 text-green-500/50 dark:text-green-400/50" />
        </CardContent>
      </Card>
      
      <Card className="bg-white/50 dark:bg-slate-900/70 dark:border-slate-800">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{t('mcpServers.stats.stdio', 'STDIO')}</p>
            <p className="text-2xl font-bold">{stdioServers}</p>
          </div>
          <Terminal className="h-8 w-8 text-slate-500/50 dark:text-slate-400/50" />
        </CardContent>
      </Card>
      
      <Card className="bg-white/50 dark:bg-slate-900/70 dark:border-slate-800">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{t('mcpServers.stats.streamable', 'Streamable')}</p>
            <p className="text-2xl font-bold">{streamableServers}</p>
          </div>
          <Globe className="h-8 w-8 text-blue-500/50 dark:text-blue-400/50" />
        </CardContent>
      </Card>
    </div>
  );
}

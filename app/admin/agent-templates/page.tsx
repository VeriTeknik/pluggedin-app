import { desc } from 'drizzle-orm';
import {
  Box,
  CheckCircle,
  Download,
  ExternalLink,
  Package,
  Star,
  Tag
} from 'lucide-react';

import { db } from '@/db';
import { agentTemplatesTable } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

import { EditTemplateDialog } from './edit-template-dialog';

export default async function AgentTemplatesPage() {
  // Fetch all agent templates
  const templates = await db
    .select()
    .from(agentTemplatesTable)
    .orderBy(desc(agentTemplatesTable.install_count));

  // Calculate statistics
  const totalTemplates = templates.length;
  const publicTemplates = templates.filter((t) => t.is_public).length;
  const verifiedTemplates = templates.filter((t) => t.is_verified).length;
  const featuredTemplates = templates.filter((t) => t.is_featured).length;
  const totalInstalls = templates.reduce((sum, t) => sum + (t.install_count || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Marketplace Agent Templates</h2>
        <p className="text-muted-foreground">
          Manage agent templates available in the marketplace
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTemplates}</div>
            <p className="text-xs text-muted-foreground">
              {publicTemplates} public
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verifiedTemplates}</div>
            <p className="text-xs text-muted-foreground">
              Official templates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Featured</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{featuredTemplates}</div>
            <p className="text-xs text-muted-foreground">
              Highlighted templates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Installs</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInstalls}</div>
            <p className="text-xs text-muted-foreground">
              Across all templates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(templates.map(t => t.category).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Unique categories
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Templates</CardTitle>
          <CardDescription>
            Marketplace templates with version and deployment configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No templates found</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Run the seed script to create your first template
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Docker Image</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Installs</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Links</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.uuid}>
                    <TableCell className="font-medium">
                      <div className="flex items-start gap-3">
                        {template.icon_url ? (
                          <img
                            src={template.icon_url}
                            alt={template.display_name || template.name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                            <Box className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{template.display_name || template.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {template.namespace}/{template.name}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">v{template.version}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {template.docker_image}
                    </TableCell>
                    <TableCell>
                      {template.category ? (
                        <Badge variant="secondary">{template.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {template.is_public && (
                          <Badge variant="default" className="bg-green-600">
                            Public
                          </Badge>
                        )}
                        {template.is_verified && (
                          <Badge variant="default" className="bg-blue-600">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Verified
                          </Badge>
                        )}
                        {template.is_featured && (
                          <Badge variant="default" className="bg-yellow-600">
                            <Star className="mr-1 h-3 w-3" />
                            Featured
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-medium">
                        {template.install_count || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(template.updated_at), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {template.repository_url && (
                          <a
                            href={template.repository_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="Repository"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {template.documentation_url && (
                          <a
                            href={template.documentation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="Documentation"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <EditTemplateDialog
                        templateId={template.uuid}
                        currentVersion={template.version}
                        currentDockerImage={template.docker_image}
                        templateName={template.display_name || template.name}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

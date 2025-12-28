import { desc } from 'drizzle-orm';
import { Activity, AlertCircle, CheckCircle, Server, XCircle } from 'lucide-react';

import { db } from '@/db';
import { modelRouterServicesTable } from '@/db/schema';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function ModelRoutersPage() {
  // Fetch all model router services
  const services = await db
    .select()
    .from(modelRouterServicesTable)
    .orderBy(desc(modelRouterServicesTable.priority));

  // Calculate statistics
  const totalServices = services.length;
  const enabledServices = services.filter((s) => s.is_enabled).length;
  const healthyServices = services.filter(
    (s) => s.is_enabled && s.health_status === 'healthy'
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Model Router Services</h2>
        <p className="text-muted-foreground">
          Manage LLM routing services for agent model access
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Services</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalServices}</div>
            <p className="text-xs text-muted-foreground">
              Registered router services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enabled</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledServices}</div>
            <p className="text-xs text-muted-foreground">
              Active routing services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthyServices}</div>
            <p className="text-xs text-muted-foreground">
              Passing health checks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Services Table */}
      <Card>
        <CardHeader>
          <CardTitle>Router Services</CardTitle>
          <CardDescription>
            LLM routing endpoints for agent model access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No router services configured</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Add your first model router service to enable LLM access for agents
              </p>
              <Button>Add Router Service</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.uuid}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        {service.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {service.url}
                    </TableCell>
                    <TableCell>
                      {service.region ? (
                        <Badge variant="outline">{service.region}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {service.is_enabled ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="mr-1 h-3 w-3" />
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {service.health_status === 'healthy' ? (
                        <Badge variant="default" className="bg-green-600">
                          <Activity className="mr-1 h-3 w-3" />
                          Healthy
                        </Badge>
                      ) : service.health_status === 'degraded' ? (
                        <Badge variant="default" className="bg-yellow-600">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Degraded
                        </Badge>
                      ) : service.health_status === 'unhealthy' ? (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Unhealthy
                        </Badge>
                      ) : (
                        <Badge variant="outline">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{service.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {service.avg_latency_ms !== null ? (
                        <span className="text-sm">{service.avg_latency_ms}ms</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {service.success_rate_percent !== null ? (
                        <span
                          className={`text-sm ${
                            service.success_rate_percent >= 95
                              ? 'text-green-600'
                              : service.success_rate_percent >= 80
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {service.success_rate_percent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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

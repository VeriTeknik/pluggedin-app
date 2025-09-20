'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Mail,Send, Users } from 'lucide-react';
import { useEffect,useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { getEmailHistory } from '../actions';

interface EmailHistoryItem {
  id: string;
  emailType: string;
  subject: string | null;
  sentAt: Date | null;
  segment: string | null;
  metadata: any;
}

export default function EmailHistoryPage() {
  const [history, setHistory] = useState<EmailHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    loadHistory();
  }, [page]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const result = await getEmailHistory({
        limit,
        offset: (page - 1) * limit,
      });

      if (result.success && result.data) {
        setHistory(result.data.history);
        setTotal(result.data.total);
      }
    } catch (error) {
      console.error('Failed to load email history:', error);
      toast.error('Failed to load email history');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const getSegmentBadge = (segment: string | null) => {
    if (!segment) return null;

    const variants: Record<string, any> = {
      all: { variant: 'default', label: 'All Users' },
      developer: { variant: 'secondary', label: 'Developers' },
      business: { variant: 'outline', label: 'Business' },
      enterprise: { variant: 'outline', label: 'Enterprise' },
    };

    const config = variants[segment] || { variant: 'outline', label: segment };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading && history.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading email history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Email History</h2>
        <p className="text-muted-foreground">
          View all sent product update emails
        </p>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No emails sent yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              When you send product updates, they will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sent Emails</CardTitle>
              <CardDescription>
                Total of {total} emails sent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Segment</TableHead>
                      <TableHead>Test Mode</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Sent At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.subject || 'No subject'}
                        </TableCell>
                        <TableCell>
                          {getSegmentBadge(item.segment)}
                        </TableCell>
                        <TableCell>
                          {item.metadata?.testMode ? (
                            <Badge variant="secondary">Test</Badge>
                          ) : (
                            <Badge variant="default">Live</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.metadata?.sentBy || 'System'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.sentAt ? format(new Date(item.sentAt), 'MMM d, yyyy h:mm a') : 'Unknown'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistics Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Test Emails</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {history.filter(h => h.metadata?.testMode).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Live Emails</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {history.filter(h => !h.metadata?.testMode).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Most Used</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {history[0]?.segment || 'All'}
                </div>
                <p className="text-xs text-muted-foreground">Segment</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
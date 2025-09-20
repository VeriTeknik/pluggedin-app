'use client';

import { Clock,FileText, Mail, Send, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { getEmailStats } from './actions';

interface EmailStats {
  totalUsers: number;
  subscribedUsers: number;
  sentToday: number;
  sentThisWeek: number;
  sentThisMonth: number;
  lastEmailSent: string | null;
}

export default function AdminEmailDashboard() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const result = await getEmailStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load email stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading statistics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Email Management</h2>
        <p className="text-muted-foreground">
          Send product updates and marketing emails to your users
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/emails/compose">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compose Email</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">New Email</div>
              <p className="text-xs text-muted-foreground">
                Create and send a product update
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/emails/templates">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Templates</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Manage</div>
              <p className="text-xs text-muted-foreground">
                Email templates and presets
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/emails/history">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">History</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">View Sent</div>
              <p className="text-xs text-muted-foreground">
                Previously sent emails
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscribed</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.subscribedUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Product updates enabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sentToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              Emails sent today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sentThisMonth || 0}</div>
            <p className="text-xs text-muted-foreground">
              Emails this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Latest email campaigns and their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.lastEmailSent ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Last email sent</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(stats.lastEmailSent).toLocaleString()}
                  </p>
                </div>
                <Link href="/admin/emails/history">
                  <Button variant="outline" size="sm">View History</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No emails sent yet</p>
              <Link href="/admin/emails/compose">
                <Button className="mt-4">Send Your First Email</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
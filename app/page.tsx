'use client';

import { ArrowRight, Beaker, LogIn, Server, Wrench } from 'lucide-react';
import Link from 'next/link';

import { LandingHero } from '@/components/landing-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="container mx-auto py-8 space-y-12">
      {/* Navigation */}
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/mcp-servers" className="flex items-center">
            <LogIn className="mr-2 h-4 w-4" />
            Enter App
          </Link>
        </Button>
      </div>
      
      {/* Hero Section */}
      <LandingHero />

      {/* Feature Cards */}
      <section className="grid md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <Server className="h-10 w-10 text-primary mb-4" />
            <CardTitle>Plugin Management</CardTitle>
            <CardDescription>
              Browse, configure, and manage MCP servers and plugins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Connect various AI tools and services through a unified interface. Configure and manage your plugins from a central dashboard.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/mcp-servers">
                Browse Plugins
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <Beaker className="h-10 w-10 text-primary mb-4" />
            <CardTitle>AI Playground</CardTitle>
            <CardDescription>
              Test and experiment with your AI tools in an interactive environment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Experience your plugins in action. The playground allows you to test different configurations and see real-time results.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/mcp-playground">
                Open Playground
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <Wrench className="h-10 w-10 text-primary mb-4" />
            <CardTitle>Custom Development</CardTitle>
            <CardDescription>
              Create and customize your own MCP servers and tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Build custom capabilities using our Python editor and integrated development environment. Extend your AI with specialized functionalities.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/custom-mcp-servers">
                Create Custom Tools
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Getting Started */}
      <section className="border rounded-lg p-8 bg-muted/10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold mb-4">New to Plugged.in?</h2>
          <p className="text-muted-foreground mb-6">
            Follow our setup guide to get your environment configured properly and start building with Plugged.in right away.
          </p>
          <Button asChild>
            <Link href="/setup-guide">
              View Setup Guide
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

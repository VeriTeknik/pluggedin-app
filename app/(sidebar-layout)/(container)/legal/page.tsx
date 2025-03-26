'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FileText, Info, Mail, Shield } from 'lucide-react';
import Link from 'next/link';

export default function LegalPage() {
  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold">Legal Information</h1>
        <p className="text-muted-foreground">
          Important documents and legal information for Plugged.in
        </p>
        <Separator className="my-4" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/legal/privacy-policy" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Privacy Policy</CardTitle>
                <CardDescription>How we collect and manage your data</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Information about the data we collect, how we use it, and your rights
                regarding your personal information.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/terms-of-service" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Terms of Service</CardTitle>
                <CardDescription>Rules and conditions for using our service</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The terms and conditions that govern your use of Plugged.in, including 
                rights, restrictions, and legal disclaimers.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/contact" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Mail className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Contact Us</CardTitle>
                <CardDescription>Get in touch with our team</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                How to reach our team for inquiries, technical support, and other
                questions about Plugged.in.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/disclaimer" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Info className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Disclaimer</CardTitle>
                <CardDescription>Important legal notices</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Release Candidate status information, warranty disclaimers, and 
                limitation of liability notices.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
} 
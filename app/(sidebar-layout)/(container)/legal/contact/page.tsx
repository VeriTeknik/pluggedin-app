'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Github, Mail } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function ContactPage() {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/legal">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t('legal.backToLegal')}</span>
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{t('legal.pages.contact.title')}</h1>
        </div>
        <p className="text-muted-foreground">
          {t('legal.pages.contact.description')}
        </p>
        <p className="text-xs text-muted-foreground">{t('legal.lastUpdated')}: March 26, 2024</p>
        <Separator className="my-4" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('legal.pages.contact.content.title')}</CardTitle>
            <CardDescription>
              {t('legal.pages.contact.content.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-medium">Email</h3>
                <p className="text-sm text-muted-foreground">
                  <a href="mailto:support@plugged.in" className="text-primary hover:underline">
                    support@plugged.in
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Github className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-medium">GitHub</h3>
                <p className="text-sm text-muted-foreground">
                  <a 
                    href="https://github.com/pluggedin-app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    github.com/pluggedin-app
                  </a>
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              <strong>Note:</strong> During the Release Candidate phase, our support 
              capabilities may be limited. We will do our best to respond to all inquiries
              in a timely manner.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Send us a Message</CardTitle>
            <CardDescription>
              Fill out the form below to send us a message
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Your email address" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="Message subject" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Your message" rows={5} />
              </div>
              
              <Button type="submit" className="w-full">
                Send Message
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                This form is for demonstration purposes only. 
                During the Release Candidate phase, please use the email address provided.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium">What is the current status of Plugged.in?</h3>
            <p className="text-sm text-muted-foreground">
              Plugged.in is currently in Release Candidate status. This means that while
              the core functionality is complete, there may still be bugs or issues that
              need to be addressed before the final release.
            </p>
          </div>
          
          <div>
            <h3 className="font-medium">How can I report a bug?</h3>
            <p className="text-sm text-muted-foreground">
              You can report bugs by sending an email to support@plugged.in or by opening
              an issue on our GitHub repository. Please include detailed steps to reproduce
              the bug, along with any relevant error messages.
            </p>
          </div>
          
          <div>
            <h3 className="font-medium">Is my data secure during the Release Candidate phase?</h3>
            <p className="text-sm text-muted-foreground">
              While we implement standard security practices, during the Release Candidate
              phase, we recommend not storing sensitive information within the service.
              Please review our Privacy Policy for more information.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { ArrowLeft, Github, Mail, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { submitContactForm } from '@/app/actions/contact';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

export default function ContactPage() {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(formRef.current!);
      const data = {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        subject: formData.get('subject') as string,
        message: formData.get('message') as string
      };

      const result = await submitContactForm(data);

      if (result.success) {
        formRef.current?.reset();
        toast.success(t('legal.pages.contact.content.form.success'));
      } else {
        toast.error(t('legal.pages.contact.content.form.error'));
      }
    } catch (error) {
      console.error('Error submitting contact form:', error);
      toast.error(t('legal.pages.contact.content.form.error'));
    } finally {
      setIsSubmitting(false);
    }
  };
  
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
                    href="https://github.com/VeriTeknik/pluggedin-app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    github.com/VeriTeknik/pluggedin-app
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-medium">Discord</h3>
                <p className="text-sm text-muted-foreground">
                  <a 
                    href="https://discord.gg/pluggedin" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    discord.gg/pluggedin
                  </a>
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              {t('legal.pages.contact.content.note')}
            </p>
            <Image src="/vtlogo.png" alt="Plugged.in Logo" width={210} height={50} className="mb-4" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.pages.contact.content.form.title')}</CardTitle>
            <CardDescription>
              {t('legal.pages.contact.content.form.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('legal.pages.contact.content.form.name')}</Label>
                <Input 
                  id="name"
                  name="name"
                  required
                  placeholder={t('legal.pages.contact.content.form.namePlaceholder')} 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">{t('legal.pages.contact.content.form.email')}</Label>
                <Input 
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder={t('legal.pages.contact.content.form.emailPlaceholder')} 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subject">{t('legal.pages.contact.content.form.subject')}</Label>
                <Input 
                  id="subject"
                  name="subject"
                  required
                  placeholder={t('legal.pages.contact.content.form.subjectPlaceholder')} 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="message">{t('legal.pages.contact.content.form.message')}</Label>
                <Textarea 
                  id="message"
                  name="message"
                  required
                  placeholder={t('legal.pages.contact.content.form.messagePlaceholder')} 
                  rows={5} 
                />
              </div>
              
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting 
                  ? t('legal.pages.contact.content.form.sending')
                  : t('legal.pages.contact.content.form.submit')
                }
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('legal.pages.contact.content.faq.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium">{t('legal.pages.contact.content.faq.status.question')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('legal.pages.contact.content.faq.status.answer')}
            </p>
          </div>
          
          <div>
            <h3 className="font-medium">{t('legal.pages.contact.content.faq.bugs.question')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('legal.pages.contact.content.faq.bugs.answer')}
            </p>
          </div>
          
          <div>
            <h3 className="font-medium">{t('legal.pages.contact.content.faq.security.question')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('legal.pages.contact.content.faq.security.answer')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

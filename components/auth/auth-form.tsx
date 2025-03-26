import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

const createLoginSchema = (t: (key: string) => string) => z.object({
  email: z.string().email({ message: t('common.validation.email') }),
  password: z.string().min(8, { message: t('common.validation.minLength') }),
});

const createRegisterSchema = (t: (key: string) => string) => createLoginSchema(t).extend({
  name: z.string().min(2, { message: t('common.validation.minLength') }),
  password_confirm: z.string().min(8, { message: t('common.validation.minLength') }),
}).refine((data) => data.password === data.password_confirm, {
  message: t('common.validation.passwordMatch'),
  path: ['password_confirm'],
});

const createForgotPasswordSchema = (t: (key: string) => string) => z.object({
  email: z.string().email({ message: t('common.validation.email') }),
});

const createResetPasswordSchema = (t: (key: string) => string) => z.object({
  password: z.string().min(8, { message: t('common.validation.minLength') }),
  password_confirm: z.string().min(8, { message: t('common.validation.minLength') }),
}).refine((data) => data.password === data.password_confirm, {
  message: t('common.validation.passwordMatch'),
  path: ['password_confirm'],
});

// Define types for each form variant
type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;
type RegisterFormValues = z.infer<ReturnType<typeof createRegisterSchema>>;
type ForgotPasswordFormValues = z.infer<ReturnType<typeof createForgotPasswordSchema>>;
type ResetPasswordFormValues = z.infer<ReturnType<typeof createResetPasswordSchema>>;

// Union type of all possible form values
type FormValues = LoginFormValues | RegisterFormValues | ForgotPasswordFormValues | ResetPasswordFormValues;

interface AuthFormProps {
  type: 'login' | 'register' | 'forgot-password' | 'reset-password';
  defaultValues?: Record<string, any>;
  onSuccess?: () => void;
}

export function AuthForm({ type, defaultValues, onSuccess }: AuthFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();

  const formActionMessage = t(`auth.${type}.actionMessage`);
  
  

  // Determine which schema to use based on the form type
  const schema = React.useMemo(() => {
    switch (type) {
      case 'login':
        return createLoginSchema(t);
      case 'register':
        return createRegisterSchema(t);
      case 'forgot-password':
        return createForgotPasswordSchema(t);
      case 'reset-password':
        return createResetPasswordSchema(t);
      default:
        return createLoginSchema(t);
    }
  }, [type, t]);

  // Initialize form with the appropriate schema and type
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || {
      email: '',
      password: '',
      name: type === 'register' ? '' : undefined,
      password_confirm: (type === 'register' || type === 'reset-password') ? '' : undefined
    },
    mode: 'onSubmit'
  });

  // Reset form validation on language change
  useEffect(() => {
    form.trigger();
  }, [t, form]);

  // Submit handler for the form
  const onSubmit = async (values: FormValues) => {
    try {
      switch (type) {
        case 'login': {
          const loginValues = values as LoginFormValues;
          console.log('Attempting login with:', { email: loginValues.email.trim() });
          
          const response = await signIn('credentials', {
            email: loginValues.email.trim(),
            password: loginValues.password,
            redirect: false,
          });

          console.log('Login response:', response);

          if (!response || response.error) {
            console.error('Login failed:', response?.error || 'No response');
            toast({
              title: t('common.error'),
              description: t('auth.login.errors.invalidCredentials'),
              variant: 'destructive',
            });
            return;
          }

          // On successful login
          console.log('Login successful, redirecting...');
          window.location.href = '/mcp-servers';
          if (onSuccess) {
            onSuccess();
          }
          break;
        }
        case 'register': {
          const registerValues = values as RegisterFormValues;
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registerValues),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: t('common.error'),
              description: data.message || t('auth.register.errors.registrationFailed'),
              variant: 'destructive',
            });
            return;
          }

          toast({
              title: t('common.success'),
              description: t('auth.register.success'),
          });

          if (onSuccess) {
            onSuccess();
          }
          break;
        }
        case 'forgot-password': {
          const forgotValues = values as ForgotPasswordFormValues;
          const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotValues.email }),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: t('common.error'),
              description: data.message || t('auth.forgotPassword.errors.requestFailed'),
              variant: 'destructive',
            });
            return;
          }

          toast({
              title: t('common.success'),
              description: t('auth.forgotPassword.success'),
          });

          if (onSuccess) {
            onSuccess();
          }
          break;
        }
        case 'reset-password': {
          const resetValues = values as ResetPasswordFormValues;
          const token = new URLSearchParams(window.location.search).get('token');
          const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              password: resetValues.password,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: t('common.error'),
              description: data.message || t('auth.resetPassword.errors.resetFailed'),
              variant: 'destructive',
            });
            return;
          }

          toast({
              title: t('common.success'),
              description: t('auth.resetPassword.success'),
          });

          router.push('/login');
          if (onSuccess) {
            onSuccess();
          }
          break;
        }
      }
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
              title: t('common.error'),
              description: t('common.errors.unexpected'),
              variant: 'destructive',
      });
    }
  };

  const formTitle = t(`auth.${type}.title`);
  const buttonText = t(`auth.${type}.submitButton`);

  // Render the social login buttons
  const renderSocialLogin = () => {
    if (type === 'forgot-password' || type === 'reset-password') {
      return null;
    }

    return (
      <div className="space-y-4 mt-4">
          <Button 
            variant="outline" 
            className="w-full" 
            type="button"
            onClick={() => {
              console.log('Initiating GitHub login...');
              signIn('github', { redirect: true });
            }}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            {t('auth.social.github')}
          </Button>
          <Button 
            variant="outline" 
            className="w-full" 
            type="button"
            onClick={() => {
              console.log('Initiating Google login...');
              signIn('google', { redirect: true });
            }}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('auth.social.google')}
          </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{formTitle}</h1>
        <p className="text-muted-foreground">Enter your details to {formActionMessage}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {type === 'register' && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.register.nameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('auth.register.namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {(type === 'login' || type === 'register' || type === 'forgot-password') && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.common.emailLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('auth.common.emailPlaceholder')} type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {(type === 'login' || type === 'register' || type === 'reset-password') && (
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.common.passwordLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('auth.common.passwordPlaceholder')} type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {(type === 'register' || type === 'reset-password') && (
            <FormField
              control={form.control}
              name="password_confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.common.confirmPasswordLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('auth.common.confirmPasswordPlaceholder')} type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <Button type="submit" className="w-full">{buttonText}</Button>
        </form>
      </Form>

      {(type === 'login' || type === 'register') && (
        <>
          <div className="flex items-center justify-center">
            <Separator className="w-full" />
            <span className="mx-2 text-xs text-muted-foreground">{t('common.or')}</span>
            <Separator className="w-full" />
          </div>

          {renderSocialLogin()}
        </>
      )}
    </div>
  );
}

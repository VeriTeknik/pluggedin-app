import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { useToast } from '@/components/ui/use-toast';

// Type for the translation function that supports interpolation
type TranslationFunction = (key: string, options?: { count?: number }) => string;

const createLoginSchema = (t: TranslationFunction) => z.object({
  email: z.string()
    .min(1, { message: t('auth.validation.emailRequired') })
    .email({ message: t('auth.validation.emailInvalid') })
    .trim(),
  password: z.string()
    .min(1, { message: t('auth.validation.passwordRequired') })
    .min(8, { message: t('auth.validation.passwordLength') })
    .regex(/[A-Z]/, { message: t('auth.validation.passwordUppercase') })
    .regex(/[a-z]/, { message: t('auth.validation.passwordLowercase') })
    .regex(/[0-9]/, { message: t('auth.validation.passwordNumber') }),
});

const createRegisterSchema = (t: TranslationFunction) => z.object({
  name: z.string()
    .min(1, { message: t('auth.validation.nameRequired') })
    .min(2, { message: t('auth.validation.nameLength') })
    .regex(/^[a-zA-Z\s]*$/, { message: t('auth.validation.nameFormat') })
    .trim(),
  email: z.string()
    .min(1, { message: t('auth.validation.emailRequired') })
    .email({ message: t('auth.validation.emailInvalid') })
    .trim(),
  password: z.string()
    .min(1, { message: t('auth.validation.passwordRequired') })
    .min(8, { message: t('auth.validation.passwordLength') })
    .regex(/[A-Z]/, { message: t('auth.validation.passwordUppercase') })
    .regex(/[a-z]/, { message: t('auth.validation.passwordLowercase') })
    .regex(/[0-9]/, { message: t('auth.validation.passwordNumber') }),
  password_confirm: z.string()
    .min(1, { message: t('auth.validation.confirmPasswordRequired') })
}).refine((data) => data.password === data.password_confirm, {
  message: t('auth.validation.passwordMatch'),
  path: ['password_confirm'],
});

const createForgotPasswordSchema = (t: TranslationFunction) => z.object({
  email: z.string()
    .min(1, { message: t('auth.validation.emailRequired') })
    .email({ message: t('auth.validation.emailInvalid') })
    .trim()
});

const createResetPasswordSchema = (t: TranslationFunction) => z.object({
  password: z.string()
    .min(1, { message: t('auth.validation.passwordRequired') })
    .min(8, { message: t('auth.validation.passwordLength') })
    .regex(/[A-Z]/, { message: t('auth.validation.passwordUppercase') })
    .regex(/[a-z]/, { message: t('auth.validation.passwordLowercase') })
    .regex(/[0-9]/, { message: t('auth.validation.passwordNumber') }),
  password_confirm: z.string()
    .min(1, { message: t('auth.validation.confirmPasswordRequired') })
}).refine((data) => data.password === data.password_confirm, {
  message: t('auth.validation.passwordMatch'),
  path: ['password_confirm'],
});

// Define types for each form variant
type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;
type RegisterFormValues = z.infer<ReturnType<typeof createRegisterSchema>>;
type ForgotPasswordFormValues = z.infer<ReturnType<typeof createForgotPasswordSchema>>;
type ResetPasswordFormValues = z.infer<ReturnType<typeof createResetPasswordSchema>>;

// Create a base type that includes all possible fields
type FormValues = {
  email?: string;
  password?: string;
  name?: string;
  password_confirm?: string;
};

interface AuthFormProps {
  type: 'login' | 'register' | 'forgot-password' | 'reset-password';
  defaultValues?: Record<string, any>;
  onSuccess?: () => void;
}

// Add this new component for password requirements
const PasswordRequirements = ({ password, isDirty }: { password: string; isDirty: boolean }) => {
  const { t } = useTranslation();
  
  // Don't show requirements if the field hasn't been touched
  if (!isDirty) return null;
  
  const requirements = [
    {
      text: t('auth.validation.passwordLengthHelper'),
      met: password.length >= 8,
    },
    {
      text: t('auth.validation.passwordUppercaseHelper'),
      met: /[A-Z]/.test(password),
    },
    {
      text: t('auth.validation.passwordLowercaseHelper'),
      met: /[a-z]/.test(password),
    },
    {
      text: t('auth.validation.passwordNumberHelper'),
      met: /[0-9]/.test(password),
    },
  ];

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {t('auth.validation.passwordRequirements')}
      </p>
      <div className="grid gap-2">
        {requirements.map((req, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded-full flex items-center justify-center ${
              req.met 
                ? 'bg-emerald-500/20 text-emerald-500' 
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
            }`}>
              {req.met ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M8.5 2.5L3.5 7.5L1.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              )}
            </div>
            <span className={`text-xs ${
              req.met 
                ? 'text-emerald-600 dark:text-emerald-400' 
                : 'text-zinc-500 dark:text-zinc-400'
            }`}>
              {req.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
    // @ts-expect-error - zodResolver v5 has type issues with union schemas
    resolver: zodResolver(schema),
    defaultValues: defaultValues || {
      email: '',
      password: '',
      name: type === 'register' ? '' : undefined,
      password_confirm: (type === 'register' || type === 'reset-password') ? '' : undefined
    },
    mode: "onTouched", // Only validate after the field is touched
    criteriaMode: "all"
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

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {formTitle}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formActionMessage}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {type === 'register' && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('auth.common.nameLabel')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('auth.common.namePlaceholder')}
                      autoComplete="name"
                      {...field}
                      className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
                    />
                  </FormControl>
                  {form.getFieldState('name').isDirty && (
                    <FormMessage className="text-xs text-zinc-500 dark:text-zinc-400" />
                  )}
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
                  <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('auth.common.emailLabel')}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('auth.common.emailPlaceholder')} 
                      type="email" 
                      autoComplete="email"
                      {...field}
                      className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
                    />
                  </FormControl>
                  {form.getFieldState('email').isDirty && (
                    <FormMessage className="text-xs text-zinc-500 dark:text-zinc-400" />
                  )}
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
                  <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('auth.common.passwordLabel')}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('auth.common.passwordPlaceholder')} 
                      type="password"
                      autoComplete={type === 'login' ? 'current-password' : 'new-password'}
                      {...field}
                      className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
                    />
                  </FormControl>
                  {form.getFieldState('password').isDirty && (
                    <FormMessage className="text-xs text-zinc-500 dark:text-zinc-400" />
                  )}
                  {(type === 'register' || type === 'reset-password' || type === 'login') && (
                    <PasswordRequirements 
                      password={field.value} 
                      isDirty={form.getFieldState('password').isDirty}
                    />
                  )}
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
                  <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('auth.common.confirmPasswordLabel')}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('auth.common.confirmPasswordPlaceholder')} 
                      type="password"
                      autoComplete="new-password"
                      {...field}
                      className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
                    />
                  </FormControl>
                  {form.getFieldState('password_confirm').isDirty && (
                    <FormMessage className="text-xs text-zinc-500 dark:text-zinc-400" />
                  )}
                </FormItem>
              )}
            />
          )}

          <Button 
            type="submit" 
            className="w-full"
          >
            {buttonText}
          </Button>

          {type === 'login' && (
            <div className="text-center">
              <Link 
                href="/forgot-password"
                className="text-sm text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </div>
          )}
        </form>
      </Form>

      {(type === 'login' || type === 'register') && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-zinc-950 px-2 text-zinc-500 dark:text-zinc-400">
                {t('common.or')}
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <Button 
              variant="outline" 
              className="bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 transition-colors" 
              type="button"
              onClick={() => signIn('github', { redirect: true })}
            >
              <svg className="h-5 w-5 mr-2 text-zinc-700 dark:text-zinc-300" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-zinc-700 dark:text-zinc-300">{t('auth.social.github')}</span>
            </Button>
            <Button 
              variant="outline" 
              className="bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 transition-colors" 
              type="button"
              onClick={() => signIn('google', { redirect: true })}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-zinc-700 dark:text-zinc-300">{t('auth.social.google')}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

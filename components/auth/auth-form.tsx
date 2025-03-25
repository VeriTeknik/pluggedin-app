import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
});

const registerSchema = loginSchema.extend({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  password_confirm: z.string().min(8, { message: 'Password must be at least 8 characters' }),
}).refine((data) => data.password === data.password_confirm, {
  message: "Passwords don't match",
  path: ['password_confirm'],
});

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  password_confirm: z.string().min(8, { message: 'Password must be at least 8 characters' }),
}).refine((data) => data.password === data.password_confirm, {
  message: "Passwords don't match",
  path: ['password_confirm'],
});

interface AuthFormProps {
  type: 'login' | 'register' | 'forgot-password' | 'reset-password';
  defaultValues?: Record<string, any>;
  onSuccess?: () => void;
}

export function AuthForm({ type, defaultValues, onSuccess }: AuthFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Determine which schema to use based on the form type
  const schema = React.useMemo(() => {
    switch (type) {
      case 'login':
        return loginSchema;
      case 'register':
        return registerSchema;
      case 'forgot-password':
        return forgotPasswordSchema;
      case 'reset-password':
        return resetPasswordSchema;
      default:
        return loginSchema;
    }
  }, [type]);

  // Initialize form with the appropriate schema
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || {},
  });

  // Submit handler for the form
  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      switch (type) {
        case 'login': {
          const response = await signIn('credentials', {
            email: values.email,
            password: values.password,
            redirect: false,
          });

          if (response?.error) {
            toast({
              title: 'Error',
              description: response.error,
              variant: 'destructive',
            });
            return;
          }

          router.push('/mcp-servers');
          if (onSuccess) onSuccess();
          break;
        }
        case 'register': {
          // Handle registration
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: 'Error',
              description: data.message || 'Registration failed',
              variant: 'destructive',
            });
            return;
          }

          toast({
            title: 'Success',
            description: 'Registration successful! Please verify your email.',
          });

          if (onSuccess) onSuccess();
          break;
        }
        case 'forgot-password': {
          // Handle forgot password
          const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: values.email }),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: 'Error',
              description: data.message || 'Request failed',
              variant: 'destructive',
            });
            return;
          }

          toast({
            title: 'Success',
            description: 'Password reset link sent to your email!',
          });

          if (onSuccess) onSuccess();
          break;
        }
        case 'reset-password': {
          // Handle reset password
          const token = new URLSearchParams(window.location.search).get('token');
          
          const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              password: values.password,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            toast({
              title: 'Error',
              description: data.message || 'Password reset failed',
              variant: 'destructive',
            });
            return;
          }

          toast({
            title: 'Success',
            description: 'Password reset successful! You can now log in with your new password.',
          });

          router.push('/login');
          if (onSuccess) onSuccess();
          break;
        }
      }
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const formTitle = React.useMemo(() => {
    switch (type) {
      case 'login':
        return 'Sign In';
      case 'register':
        return 'Create an Account';
      case 'forgot-password':
        return 'Forgot Password';
      case 'reset-password':
        return 'Reset Password';
      default:
        return 'Authentication';
    }
  }, [type]);

  const buttonText = React.useMemo(() => {
    switch (type) {
      case 'login':
        return 'Sign In';
      case 'register':
        return 'Register';
      case 'forgot-password':
        return 'Send Reset Link';
      case 'reset-password':
        return 'Reset Password';
      default:
        return 'Submit';
    }
  }, [type]);

  // Render the social login buttons
  const renderSocialLogin = () => {
    if (type === 'forgot-password' || type === 'reset-password') return null;

    return (
      <div className="space-y-4 mt-4">
        <Button 
          variant="outline" 
          className="w-full" 
          type="button"
          onClick={() => signIn('github', { callbackUrl: '/mcp-servers' })}
        >
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          Continue with GitHub
        </Button>
        <Button 
          variant="outline" 
          className="w-full" 
          type="button"
          onClick={() => signIn('google', { callbackUrl: '/mcp-servers' })}
        >
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{formTitle}</h1>
        <p className="text-muted-foreground">Enter your details to {type === 'login' ? 'sign in to' : type === 'register' ? 'create' : 'manage'} your account</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {type === 'register' && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Email address" type="email" {...field} />
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input placeholder="Password" type="password" {...field} />
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
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input placeholder="Confirm password" type="password" {...field} />
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
            <span className="mx-2 text-xs text-muted-foreground">OR</span>
            <Separator className="w-full" />
          </div>

          {renderSocialLogin()}
        </>
      )}
    </div>
  );
} 
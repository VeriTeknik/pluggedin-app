'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthForm } from '@/components/auth/auth-form';

type AuthLayoutProps = {
  type: 'login' | 'register' | 'forgot-password' | 'reset-password';
  children?: ReactNode;
};

type LinkConfigType = {
  primary: {
    text: string;
    linkText: string;
    href: string;
  };
  secondary?: {
    text?: string;
    linkText: string;
    href: string;
  };
};

export function AuthLayout({ type, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  
  // Define the link configuration for each auth type
  const getLinkConfig = (): LinkConfigType => {
    switch (type) {
      case 'login':
        return {
          primary: {
            text: t('auth.links.login.noAccount'),
            linkText: t('auth.links.login.signUp'),
            href: "/register",
          },
          secondary: {
            linkText: t('auth.login.forgotPassword'),
            href: "/forgot-password",
          }
        };
      case 'register':
        return {
          primary: {
            text: t('auth.links.register.hasAccount'),
            linkText: t('auth.links.register.signIn'),
            href: "/login",
          }
        };
      case 'forgot-password':
      case 'reset-password':
        return {
          primary: {
            text: t('auth.links.forgotPassword.rememberPassword'),
            linkText: t('auth.links.forgotPassword.backToLogin'),
            href: "/login",
          }
        };
      default:
        return {
          primary: {
            text: "",
            linkText: "",
            href: "/",
          }
        };
    }
  };

  const linkConfig = getLinkConfig();

  return (
    <div className="space-y-6">
      <AuthForm type={type} />
      
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          {linkConfig.primary.text && (
            <>{linkConfig.primary.text}{' '}</>
          )}
          <Link
            href={linkConfig.primary.href}
            className="underline underline-offset-4 hover:text-primary"
          >
            {linkConfig.primary.linkText}
          </Link>
        </p>

        {linkConfig.secondary && (
          <p className="text-sm text-muted-foreground">
            {linkConfig.secondary.text && (
              <>{linkConfig.secondary.text}{' '}</>
            )}
            <Link
              href={linkConfig.secondary.href}
              className="underline underline-offset-4 hover:text-primary"
            >
              {linkConfig.secondary.linkText}
            </Link>
          </p>
        )}
      </div>

      {children}
    </div>
  );
} 
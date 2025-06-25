'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { AuthForm } from '@/components/auth/auth-form';

type AuthLayoutProps = {
  type: 'login' | 'register' | 'forgot-password' | 'reset-password';
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

// Static mapping for link configurations
const LINK_CONFIGS: Record<AuthLayoutProps['type'], (t: any) => LinkConfigType> = {
  'login': (t) => ({
    primary: {
      text: t('auth.links.login.noAccount'),
      linkText: t('auth.links.login.signUp'),
      href: "/register",
    },
    secondary: {
      linkText: t('auth.links.login.forgotPassword'),
      href: "/forgot-password",
    }
  }),
  'register': (t) => ({
    primary: {
      text: t('auth.links.register.hasAccount'),
      linkText: t('auth.links.register.signIn'),
      href: "/login",
    }
  }),
  'forgot-password': (t) => ({
    primary: {
      text: t('auth.links.forgotPassword.rememberPassword'),
      linkText: t('auth.links.forgotPassword.backToLogin'),
      href: "/login",
    }
  }),
  'reset-password': (t) => ({
    primary: {
      text: t('auth.links.forgotPassword.rememberPassword'),
      linkText: t('auth.links.forgotPassword.backToLogin'),
      href: "/login",
    }
  }),
};

export function AuthLayout({ type }: AuthLayoutProps) {
  const { t } = useTranslation();
  
  const linkConfig = LINK_CONFIGS[type]?.(t) || {
    primary: {
      text: "",
      linkText: "",
      href: "/",
    }
  };

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
    </div>
  );
} 
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ClientDisplay } from '@/lib/oauth/provider/client-display';
import type { Scope } from '@/lib/oauth/provider/scopes';

import { approveConsent, denyConsent } from './actions';

interface Props {
  /**
   * Signed carrier for the already-validated authorize request. The form never
   * sees clientUuid, redirectUri or codeChallenge as editable values, because
   * the server action must not accept them from the caller.
   */
  ticket: string;
  client: ClientDisplay;
  redirectHost: string;
  loopbackOnly: boolean;
  scopes: Scope[];
  projects: { uuid: string; name: string }[];
}

export function ConsentForm(props: Props) {
  const { t } = useTranslation('oauth');
  // A single Hub is preselected: most users have one, and making them tick a
  // box to reach the state they already expected is friction without benefit.
  const [selected, setSelected] = useState<string[]>(
    props.projects.length === 1 ? [props.projects[0].uuid] : []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setBusy(true);
    setError(null);
    const result = await approveConsent({
      ticket: props.ticket,
      grantedProjectUuids: selected,
    });
    if (result.success) {
      window.location.href = result.data.redirectTo;
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  async function onDeny() {
    const result = await denyConsent(props.ticket);
    if (result.success) window.location.href = result.data.redirectTo;
    else setError(result.error);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('consent.title', { client: props.client.name })}</h1>

      {/* A client names itself, so the name alone would be a phishing prompt:
          anyone can publish a document calling themselves Claude. It is shown
          because users cannot judge a raw URL, but never on its own — the origin
          that served the document is stated beneath it, and a DCR name, which
          has no origin behind it at all, is labelled unverified. */}
      {props.client.nameIsSelfAsserted &&
        (props.client.origin ? (
          <p className="text-sm text-muted-foreground">
            {t('consent.verifiedOrigin', { origin: props.client.origin })}
          </p>
        ) : (
          <p className="text-sm text-amber-600">{t('consent.unverifiedName')}</p>
        ))}

      {/* The spec requires showing the redirect host, and warning when the only
          registered URIs are loopback — a CIMD cannot prevent a local process
          from binding a port and impersonating the client. */}
      <p className="text-sm text-muted-foreground">
        {t('consent.redirectTo', { host: props.redirectHost })}
      </p>
      {props.loopbackOnly && (
        <p className="text-sm text-amber-600">{t('consent.loopbackWarning')}</p>
      )}

      <section>
        <h2 className="mb-2 font-medium">{t('consent.hubsTitle')}</h2>
        {props.projects.map((project) => (
          <label key={project.uuid} className="flex items-center gap-2 py-1">
            <Checkbox
              checked={selected.includes(project.uuid)}
              onCheckedChange={(checked) =>
                setSelected((prev) =>
                  checked ? [...prev, project.uuid] : prev.filter((u) => u !== project.uuid)
                )
              }
            />
            <span>{project.name}</span>
          </label>
        ))}
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t('consent.scopesTitle')}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {props.scopes.map((scope) => (
            <li key={scope}>{t(`consent.scope.${scope}`)}</li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={onApprove} disabled={busy || selected.length === 0}>
          {t('consent.approve')}
        </Button>
        <Button variant="outline" onClick={onDeny} disabled={busy}>
          {t('consent.deny')}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useTranslation } from 'react-i18next';

/** An authorization request that cannot be answered with a redirect. */
export function AuthorizeRequestError({ reason }: { reason: 'repeatedClientParameter' }) {
  const { t } = useTranslation('oauth');
  return <p className="p-6">{t(`authorize.errors.${reason}`)}</p>;
}

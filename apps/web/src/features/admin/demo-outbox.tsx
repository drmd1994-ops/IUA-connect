'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage, isApiError } from '@/lib/api-errors';

type List = components['schemas']['DemoOutboxListDto'];
type Email = components['schemas']['DemoEmailDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * The emails the demo "sent" (M18): on a host nobody can open the folder they are written to,
 * and sign-up and password reset need their links. The API answers 404 where the site sends
 * real email. Opening one is recorded in the audit log.
 */
export function DemoOutboxPage() {
  const t = useTranslations();
  const o = (key: string) => t(`admin.demoOutbox.${key}`);
  const format = useFormatter();
  const { api, call } = useAuth();
  const [list, setList] = useState<List | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/demo-outbox'))
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function open(id: string) {
    try {
      setEmail(
        await call(() => api.GET('/api/v1/admin/demo-outbox/{id}', { params: { path: { id } } })),
      );
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{o('title')}</h1>
        <p className="mt-2 text-text-muted">{o('intro')}</p>
      </div>
      {error !== null &&
        (isApiError(error, 'NOT_FOUND') && !list ? (
          <Alert tone="info">{o('notAvailable')}</Alert>
        ) : (
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        ))}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}

      {email ? (
        <section aria-labelledby="demo-email" className="flex flex-col gap-4">
          <div>
            <Button type="button" variant="link" onClick={() => setEmail(null)}>
              {o('back')}
            </Button>
          </div>
          <h2 id="demo-email" className="text-xl font-semibold">
            {email.subject}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-semibold">{o('to')}</dt>
            <dd dir="ltr" className="text-start">
              {email.to}
            </dd>
            <dt className="font-semibold">{o('sentAt')}</dt>
            <dd>{when(email.sentAt)}</dd>
          </dl>
          <div>
            <h3 className="font-semibold">{o('links')}</h3>
            {email.links.length === 0 ? (
              <p className="text-text-muted">{o('noLinks')}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {email.links.map((href) => (
                  <li key={href} dir="ltr" className="break-all text-start">
                    <a href={href} className={link}>
                      {href}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">{o('text')}</h3>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border p-4 font-sans text-sm">
              {email.text}
            </pre>
          </div>
        </section>
      ) : (
        list &&
        (list.items.length === 0 ? (
          <p className="text-text-muted">{o('empty')}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid="demo-outbox-table">
              <thead className="bg-surface-muted">
                <tr>
                  {(['sentAt', 'to', 'subject'] as const).map((column) => (
                    <th key={column} scope="col" className="p-3 text-start">
                      {o(column)}
                    </th>
                  ))}
                  <th scope="col" className="p-3 text-start">
                    <span className="sr-only">{o('open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="whitespace-nowrap p-3">{when(item.sentAt)}</td>
                    <td className="p-3" dir="ltr">
                      {item.to}
                    </td>
                    <td className="p-3">{item.subject}</td>
                    <td className="p-3">
                      <Button type="button" variant="link" onClick={() => void open(item.id)}>
                        {o('open')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

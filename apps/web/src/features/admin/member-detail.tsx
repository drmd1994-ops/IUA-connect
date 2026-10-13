'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { useDateFormat } from '@/features/membership/membership-page';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Detail = components['schemas']['AdminMembershipDetailDto'];
type Payment = Detail['membership']['paymentStatus'];
type Action = 'renew' | 'suspend' | 'reinstate' | 'expire';

const PAYMENTS: Payment[] = ['NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED'];

export function MemberDetail({ id }: { id: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const { date, dateTime } = useDateFormat();
  const { api, call } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState<Payment | ''>('');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/memberships/{id}', { params: { path: { id } } }))
      .then((result) => active && setDetail(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  async function run(key: string, request: () => Promise<Detail>) {
    setPending(key);
    setError(null);
    setMessage(null);
    try {
      setDetail(await request());
      setReason('');
      setMessage(t('admin.member.done'));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const act = (action: Action) =>
    run(action, () =>
      call(() => {
        const params = { path: { id } };
        const note = reason.trim();
        const body = note ? { reason: note } : {};
        switch (action) {
          case 'renew':
            return api.POST('/api/v1/admin/memberships/{id}/renew', { params, body });
          case 'suspend':
            return api.POST('/api/v1/admin/memberships/{id}/suspend', {
              params,
              body: { reason: note },
            });
          case 'reinstate':
            return api.POST('/api/v1/admin/memberships/{id}/reinstate', { params, body });
          case 'expire':
            return api.POST('/api/v1/admin/memberships/{id}/expire', { params, body });
        }
      }),
    );

  if (!detail) {
    return error !== null ? (
      <Alert tone="error">{errorMessage(error, t)}</Alert>
    ) : (
      <p role="status">{t('membership.common.loading')}</p>
    );
  }
  const { membership, history } = detail;
  const person =
    [membership.member.firstName, membership.member.lastName].filter(Boolean).join(' ') ||
    membership.member.email;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/members" className="text-sm text-primary underline underline-offset-4">
        {t('admin.member.back')}
      </Link>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{person}</h1>
        <p className="text-text-muted" dir="ltr">
          {membership.member.email}
        </p>
      </div>
      <dl
        className="grid gap-4 rounded-md border border-border p-5 sm:grid-cols-3"
        data-testid="member-detail"
      >
        <Item label={t('membership.membership.type')} value={name(membership.type)} />
        <Item
          label={t('membership.membership.status')}
          value={t(`membership.membership.statuses.${membership.status}`)}
        />
        <Item label={t('membership.membership.validFrom')} value={date(membership.startDate)} />
        <Item label={t('membership.membership.validUntil')} value={date(membership.endDate)} />
        <Item
          label={t('membership.membership.payment')}
          value={t(`membership.membership.payments.${membership.paymentStatus}`)}
        />
        <Item
          label={t('admin.member.source')}
          value={t(`admin.member.sources.${membership.source}`)}
        />
        <Item
          label={t('admin.member.numberOnFile')}
          value={
            membership.identifierOnFile ? t('membership.common.yes') : t('membership.common.no')
          }
        />
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-xl font-semibold">
          {t('admin.member.actions')}
        </h2>
        {message && <Alert tone="success">{message}</Alert>}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        <TextField
          label={t('admin.member.reason')}
          hint={t('admin.member.reasonOptional')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="button" pending={pending === 'renew'} onClick={() => void act('renew')}>
            {t('admin.member.renew')}
          </Button>
          {membership.status === 'SUSPENDED' ? (
            <Button
              type="button"
              variant="secondary"
              pending={pending === 'reinstate'}
              onClick={() => void act('reinstate')}
            >
              {t('admin.member.reinstate')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              pending={pending === 'suspend'}
              disabled={!reason.trim()}
              onClick={() => void act('suspend')}
            >
              {t('admin.member.suspend')}
            </Button>
          )}
          {membership.status !== 'EXPIRED' && (
            <Button
              type="button"
              variant="danger"
              pending={pending === 'expire'}
              onClick={() => void act('expire')}
            >
              {t('admin.member.expire')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t('membership.membership.payment')}
            value={payment || membership.paymentStatus}
            onChange={(event) => setPayment(event.target.value as Payment)}
            options={PAYMENTS.map((p) => ({
              value: p,
              label: t(`membership.membership.payments.${p}`),
            }))}
          />
          <Button
            type="button"
            variant="secondary"
            pending={pending === 'payment'}
            disabled={!payment || payment === membership.paymentStatus}
            onClick={() =>
              void run('payment', () =>
                call(() =>
                  api.PATCH('/api/v1/admin/memberships/{id}/payment-status', {
                    params: { path: { id } },
                    body: {
                      paymentStatus: payment as Payment,
                      ...(reason.trim() ? { reason: reason.trim() } : {}),
                    },
                  }),
                ),
              )
            }
          >
            {t('admin.member.setPayment')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t('membership.membership.historyTitle')}</h2>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {history.map((entry) => (
            <li key={`${entry.at}-${entry.event}`} className="p-3 text-sm">
              <span className="font-semibold">
                {t(`membership.membership.events.${entry.event}`)}
              </span>
              <span className="text-text-muted"> · {dateTime(entry.at)}</span>
              {entry.reason && (
                <p className="text-text-muted">
                  {t('membership.membership.reason', { reason: entry.reason })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

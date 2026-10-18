import type { Calculator } from '@medconnect/calculators';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

/**
 * Where a calculator comes from and who checked it (M30 plan §3), shown on its page always,
 * whatever the result.
 */
export function CalculatorSource({ calculator }: { calculator: Calculator }) {
  const t = useTranslations('calculators.about');
  const format = useFormatter();
  const locale = useLocale();
  const { reference, review, version } = calculator;
  const href = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
  return (
    <aside
      aria-labelledby="calculator-source"
      className="flex flex-col gap-2 rounded-md border border-border p-5 text-sm"
    >
      <h2 id="calculator-source" className="text-base font-semibold">
        {t('source')}
      </h2>
      <p dir="ltr" className="text-start">
        {reference.citation}{' '}
        {href && (
          <a href={href} className="font-semibold text-primary underline underline-offset-4">
            {reference.doi ? `doi:${reference.doi}` : href}
          </a>
        )}
      </p>
      {version && <p>{t('version', { version })}</p>}
      {review ? (
        <p>
          {t('reviewed', {
            name: review.by,
            date: format.dateTime(new Date(`${review.on}T00:00:00Z`), {
              dateStyle: 'long',
              timeZone: 'UTC',
            }),
          })}
        </p>
      ) : (
        <p className="font-semibold text-warning-700">{t('notReviewed')}</p>
      )}
      {calculator.hebrewNotValidated && locale === 'he' && <p>{t('hebrewNotValidated')}</p>}
      <p className="text-text-muted">{t('nothingStored')}</p>
    </aside>
  );
}

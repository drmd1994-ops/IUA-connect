import { CALCULATORS, type CalculatorKind } from '@medconnect/calculators';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const KINDS: CalculatorKind[] = ['questionnaire', 'score', 'formula'];

/** Every calculator, by kind (M30 plan §2). Open to everyone, signed in or not (§10). */
export function CalculatorList() {
  const t = useTranslations('calculators');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('list.title')}</h1>
        <p className="mt-4 text-lg">{t('list.intro')}</p>
        <p className="mt-2 text-sm font-semibold">{t('about.disclaimer')}</p>
      </div>
      {KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`calculators-${kind}`}>
          <h2 id={`calculators-${kind}`} className="text-xl font-semibold">
            {t(`list.kinds.${kind}`)}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {CALCULATORS.filter((calculator) => calculator.kind === kind).map((calculator) => (
              <li key={calculator.id} className="rounded-md border border-border p-4">
                <Link
                  href={`/calculators/${calculator.id}`}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {t(`items.${calculator.id}.name`)}
                </Link>
                <p className="mt-1 text-text-muted">{t(`items.${calculator.id}.summary`)}</p>
                {!calculator.review && (
                  <p className="mt-1 text-sm font-semibold text-warning-700">
                    {t('list.notReviewed')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-text-muted">{t('list.notIncluded')}</p>
    </div>
  );
}

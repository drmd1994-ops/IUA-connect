'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Shows freshly issued recovery codes once, with copy and download. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('auth.security');
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'iua-connect-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="recovery-title" className="flex flex-col gap-3">
      <h3 id="recovery-title" className="font-semibold text-text">
        {t('recoveryTitle')}
      </h3>
      <p className="text-sm text-text-muted">{t('recoveryIntro')}</p>
      <ul
        dir="ltr"
        className="grid grid-cols-2 gap-2 rounded-md bg-surface-muted p-4 font-mono text-sm"
        data-testid="recovery-codes"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? t('copied') : t('copy')}
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          {t('download')}
        </Button>
        <Button type="button" onClick={onDone}>
          {t('recoverySaved')}
        </Button>
      </div>
    </section>
  );
}

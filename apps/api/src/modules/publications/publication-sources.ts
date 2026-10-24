import { Injectable, Logger } from '@nestjs/common';

/**
 * The two outside services publications come from (M27 plan §5; owner answer §10.3): PubMed's
 * E-utilities and ORCID's public API. Both are free, without an account; the server sends them
 * only the identifier the person typed. A service that is down or slow (5 seconds) answers
 * `unavailable`, and typing by hand still works.
 */

export interface PublicationDraft {
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
}

export type LookupResult =
  { ok: true; drafts: PublicationDraft[] } | { ok: false; reason: 'notFound' | 'unavailable' };

const TIMEOUT_MS = 5000;
const PUBMED = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const ORCID = 'https://pub.orcid.org/v3.0';
/** PubMed allows 3 requests a second without a key: one at a time, a little apart. */
const PUBMED_SPACING_MS = 350;

type Fetch = typeof fetch;

/** A DOI as people write it, without the resolver's address, in lower case. */
export function cleanDoi(value: string): string | null {
  const doi = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

export const cleanPmid = (value: string): string | null =>
  /^\d{1,9}$/.test(value.trim()) ? value.trim() : null;

@Injectable()
export class PubMedSource {
  private readonly logger = new Logger(PubMedSource.name);
  private queue: Promise<unknown> = Promise.resolve();
  /** The web requests; replaced in tests by recorded answers. */
  fetch: Fetch = (...args) => fetch(...args);

  /** One publication by its PubMed ID or its DOI. */
  async find(id: { pmid: string } | { doi: string }): Promise<LookupResult> {
    try {
      let pmid = 'pmid' in id ? id.pmid : null;
      if (!pmid) {
        const search = await this.json<{ esearchresult?: { idlist?: string[] } }>(
          `${PUBMED}/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`${(id as { doi: string }).doi}[doi]`)}`,
        );
        pmid = search.esearchresult?.idlist?.[0] ?? null;
        if (!pmid) return { ok: false, reason: 'notFound' };
      }
      const summary = await this.json<{ result?: Record<string, PubMedSummary> }>(
        `${PUBMED}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}`,
      );
      const item = summary.result?.[pmid];
      if (!item || item.error || !item.title) return { ok: false, reason: 'notFound' };
      const doi = item.articleids?.find((a) => a.idtype === 'doi')?.value ?? null;
      const year = Number.parseInt((item.pubdate ?? '').slice(0, 4), 10);
      return {
        ok: true,
        drafts: [
          {
            title: item.title.replace(/\.$/, ''),
            authors: (item.authors ?? []).map((a) => a.name).join(', '),
            journal: item.fulljournalname || item.source || null,
            year: Number.isFinite(year) ? year : null,
            doi: doi ? doi.toLowerCase() : null,
            pmid,
            url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          },
        ],
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'PubMed did not answer');
      return { ok: false, reason: 'unavailable' };
    }
  }

  private json<T>(url: string): Promise<T> {
    const run = this.queue.then(async () => {
      const response = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      await new Promise((done) => setTimeout(done, PUBMED_SPACING_MS));
      if (!response.ok) throw new Error(`PubMed answered ${response.status}`);
      return (await response.json()) as T;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

interface PubMedSummary {
  error?: string;
  title?: string;
  authors?: { name: string }[];
  source?: string;
  fulljournalname?: string;
  pubdate?: string;
  articleids?: { idtype: string; value: string }[];
}

@Injectable()
export class OrcidSource {
  private readonly logger = new Logger(OrcidSource.name);
  fetch: Fetch = (...args) => fetch(...args);

  /** The works on a public ORCID record, newest first. */
  async works(orcid: string): Promise<LookupResult> {
    try {
      const response = await this.fetch(`${ORCID}/${encodeURIComponent(orcid)}/works`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return { ok: false, reason: 'notFound' };
      if (!response.ok) throw new Error(`ORCID answered ${response.status}`);
      const body = (await response.json()) as { group?: { 'work-summary'?: OrcidWork[] }[] };
      const drafts = (body.group ?? []).flatMap((group) => {
        const work = group['work-summary']?.[0];
        const title = work?.title?.title?.value?.trim();
        if (!work || !title) return [];
        const ids = work['external-ids']?.['external-id'] ?? [];
        const idOf = (type: string) =>
          ids.find((x) => x['external-id-type'] === type)?.['external-id-value'] ?? null;
        const doi = idOf('doi');
        const pmid = idOf('pmid');
        const year = Number.parseInt(work['publication-date']?.year?.value ?? '', 10);
        return [
          {
            title,
            authors: '',
            journal: work['journal-title']?.value ?? null,
            year: Number.isFinite(year) ? year : null,
            doi: doi ? cleanDoi(doi) : null,
            pmid: pmid ? cleanPmid(pmid) : null,
            url: work.url?.value ?? (doi ? `https://doi.org/${cleanDoi(doi) ?? doi}` : null),
          },
        ];
      });
      drafts.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      return { ok: true, drafts };
    } catch (error) {
      this.logger.warn({ err: error }, 'ORCID did not answer');
      return { ok: false, reason: 'unavailable' };
    }
  }
}

interface OrcidWork {
  title?: { title?: { value?: string } };
  'journal-title'?: { value?: string } | null;
  'publication-date'?: { year?: { value?: string } | null } | null;
  'external-ids'?: {
    'external-id'?: { 'external-id-type': string; 'external-id-value': string }[];
  } | null;
  url?: { value?: string } | null;
}

import { OrcidSource, PubMedSource, cleanDoi, cleanPmid } from './publication-sources';

/** Recorded answers, made up in the services' own shapes; no real person or paper. */
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('publication sources', () => {
  it('reads DOIs and PubMed IDs as people write them', () => {
    expect(cleanDoi('https://doi.org/10.1000/XYZ.123')).toBe('10.1000/xyz.123');
    expect(cleanDoi('doi: 10.1000/abc')).toBe('10.1000/abc');
    expect(cleanDoi('not a doi')).toBeNull();
    expect(cleanPmid(' 12345678 ')).toBe('12345678');
    expect(cleanPmid('PMC123')).toBeNull();
  });

  it('fills a publication from PubMed by its DOI', async () => {
    const pubmed = new PubMedSource();
    const urls: string[] = [];
    pubmed.fetch = ((url: string) => {
      urls.push(url);
      return url.includes('esearch')
        ? answer(200, { esearchresult: { idlist: ['99000001'] } })
        : answer(200, {
            result: {
              '99000001': {
                title: 'A made-up study of nothing in particular.',
                authors: [{ name: 'Fictional A' }, { name: 'Sample B' }],
                fulljournalname: 'Journal of Examples',
                pubdate: '2024 Mar',
                articleids: [{ idtype: 'doi', value: '10.1000/EXAMPLE' }],
              },
            },
          });
    }) as typeof fetch;
    expect(await pubmed.find({ doi: '10.1000/example' })).toEqual({
      ok: true,
      drafts: [
        {
          title: 'A made-up study of nothing in particular',
          authors: 'Fictional A, Sample B',
          journal: 'Journal of Examples',
          year: 2024,
          doi: '10.1000/example',
          pmid: '99000001',
          url: 'https://pubmed.ncbi.nlm.nih.gov/99000001/',
        },
      ],
    });
    // Only the identifier is sent.
    expect(urls[0]).toContain(encodeURIComponent('10.1000/example[doi]'));
  });

  it('says when PubMed has no such publication, or does not answer', async () => {
    const pubmed = new PubMedSource();
    pubmed.fetch = (() =>
      answer(200, { result: { '1': { error: 'cannot get document summary' } } })) as typeof fetch;
    expect(await pubmed.find({ pmid: '1' })).toEqual({ ok: false, reason: 'notFound' });
    pubmed.fetch = (() => Promise.reject(new Error('timeout'))) as typeof fetch;
    expect(await pubmed.find({ pmid: '1' })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('lists the works of an ORCID record, newest first', async () => {
    const orcid = new OrcidSource();
    orcid.fetch = (() =>
      answer(200, {
        group: [
          {
            'work-summary': [
              {
                title: { title: { value: 'An older made-up paper' } },
                'journal-title': { value: 'Examples Quarterly' },
                'publication-date': { year: { value: '2019' } },
                'external-ids': { 'external-id': [] },
                url: null,
              },
            ],
          },
          {
            'work-summary': [
              {
                title: { title: { value: 'A newer made-up paper' } },
                'journal-title': null,
                'publication-date': { year: { value: '2023' } },
                'external-ids': {
                  'external-id': [
                    { 'external-id-type': 'doi', 'external-id-value': '10.1000/NEW' },
                  ],
                },
                url: null,
              },
            ],
          },
        ],
      })) as typeof fetch;
    const result = await orcid.works('0000-0000-0000-0000');
    expect(result.ok && result.drafts.map((d) => [d.title, d.year, d.doi, d.url])).toEqual([
      ['A newer made-up paper', 2023, '10.1000/new', 'https://doi.org/10.1000/new'],
      ['An older made-up paper', 2019, null, null],
    ]);
    orcid.fetch = (() => answer(404, {})) as typeof fetch;
    expect(await orcid.works('0000-0000-0000-0000')).toEqual({ ok: false, reason: 'notFound' });
  });
});

/**
 * Which pages the importer may read (M4 plan §3, §4). The list of pages is hand-picked; this
 * check is the first line of defence against anything else, above all the physician directory
 * (decision D11). An address is allowed only if it matches one of the shapes below exactly.
 */
export const SOURCE_HOST = 'urology.ima.org.il';

export type SourceKind = 'news' | 'guidelines' | 'position-papers' | 'conference';

/** `ViewContent.aspx?CategoryId=` pages that list documents. */
const DOCUMENT_LISTS: Record<string, SourceKind> = {
  '9249': 'guidelines',
  '9240': 'position-papers',
};

export type SourceCheck =
  { ok: true; kind: SourceKind; url: string } | { ok: false; reason: string };

const refuse = (reason: string): SourceCheck => ({ ok: false, reason });

/**
 * Checks one address from `sources.json`. `kind` is what the list says the page is; conference
 * pages are ordinary content pages, so they are accepted only when the list names them as such.
 */
export function checkSource(address: string, expected: SourceKind): SourceCheck {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return refuse('not an address');
  }
  if (url.protocol !== 'https:') return refuse('only https');
  if (url.hostname !== SOURCE_HOST) return refuse(`only ${SOURCE_HOST}`);
  if (url.port || url.username || url.password || url.hash) return refuse('unexpected parts');
  const params = [...url.searchParams.entries()];
  if (params.length !== 1) return refuse('exactly one parameter expected');
  const [name, value] = params[0]!;
  if (!/^\d{1,9}$/.test(value)) return refuse('the parameter must be a number');

  if (url.pathname === '/ViewArticle.aspx' && name === 'aId') {
    return expected === 'news' ? accept(url, 'news') : refuse('this is a news page');
  }
  if (url.pathname === '/ViewContent.aspx' && name === 'CategoryId') {
    const list = DOCUMENT_LISTS[value];
    if (list) return expected === list ? accept(url, list) : refuse(`this is the ${list} list`);
    return expected === 'conference'
      ? accept(url, 'conference')
      : refuse('not a known document list');
  }
  return refuse('this part of the site is not imported');
}

function accept(url: URL, kind: SourceKind): SourceCheck {
  return { ok: true, kind, url: url.toString() };
}

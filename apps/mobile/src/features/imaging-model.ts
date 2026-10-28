/**
 * The scan viewer's address (M36): OHIF under /viewer on the site, opened with the signed link to
 * one scan that the API gives after its access check. The same address as the site uses.
 */
export function viewerAddress(
  webUrl: string,
  link: { configUrl: string; studyUid: string },
  locale: string,
): string {
  const query = new URLSearchParams({
    url: link.configUrl,
    studyInstanceUIDs: link.studyUid,
    lng: locale === 'he' ? 'he' : 'en-US',
  });
  return `${webUrl}/viewer/viewer/medconnect?${query.toString()}`;
}

/** Whether an address belongs to the site, which the in-app viewer may show. */
export function isSiteAddress(webUrl: string, address: string): boolean {
  try {
    return new URL(address).origin === new URL(webUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Whether an address the viewer tries to go to, outside the site, may open in the phone's
 * browser: a web page or an email only. Anything else (about:blank, another app's link) is
 * refused without opening anything.
 */
export function opensOutside(address: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(address);
}

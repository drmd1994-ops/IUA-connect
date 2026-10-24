import { describe, expect, it } from 'vitest';
import { isSiteAddress, viewerAddress } from './imaging-model';

describe('the scan viewer’s address (M36)', () => {
  const link = { configUrl: '/api/v1/imaging/v/s.1.x/config.json', studyUid: '2.25.1' };

  it('opens the one scan, in the app’s language', () => {
    const address = new URL(viewerAddress('https://web.example', link, 'he'));
    expect(address.origin + address.pathname).toBe('https://web.example/viewer/viewer/medconnect');
    expect(address.searchParams.get('url')).toBe(link.configUrl);
    expect(address.searchParams.get('studyInstanceUIDs')).toBe('2.25.1');
    expect(address.searchParams.get('lng')).toBe('he');
    expect(new URL(viewerAddress('https://web.example', link, 'en')).searchParams.get('lng')).toBe(
      'en-US',
    );
  });

  it('keeps the viewer to the site', () => {
    expect(isSiteAddress('https://web.example', 'https://web.example/viewer/x')).toBe(true);
    expect(isSiteAddress('https://web.example', 'https://ohif.org/')).toBe(false);
    expect(isSiteAddress('https://web.example', 'not an address')).toBe(false);
  });
});

import { LinkVideoProvider } from './video-provider';

describe('LinkVideoProvider', () => {
  const provider = new LinkVideoProvider();

  it('accepts web links', () => {
    expect(provider.accepts('https://video.example.test/lecture')).toBe(true);
    expect(provider.accepts('http://video.example.test/lecture?part=2')).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/video.mp4',
    'ftp://video.example.test/lecture',
    '//video.example.test/lecture',
    '/he/education',
    'not a link',
    '',
    `https://video.example.test/${'a'.repeat(500)}`,
  ])('refuses %s', (reference) => {
    expect(provider.accepts(reference)).toBe(false);
  });

  it('presents a recording as a link to its host, the same for every viewer', () => {
    const reference = 'https://video.example.test/lecture';
    expect(provider.playback(reference)).toEqual({ kind: 'LINK', url: reference });
  });

  it('says which provider it is', () => {
    expect(provider.name).toBe('links');
  });
});

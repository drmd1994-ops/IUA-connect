import { sitePath } from './notifier';

describe('sitePath', () => {
  it('drops the host and the language', () => {
    expect(sitePath('https://iua.example.test/he/events/annual')).toBe('/events/annual');
    expect(sitePath('http://localhost:3001/en/account/membership')).toBe('/account/membership');
    expect(sitePath('/he/news/x')).toBe('/news/x');
  });

  it('stores Hebrew addresses readable', () => {
    expect(sitePath('https://iua.example.test/he/events/%D7%9B%D7%A0%D7%A1')).toBe('/events/כנס');
    expect(sitePath('https://iua.example.test/he/events/%E0%A4%A')).toBeNull();
  });

  it('leaves a path that only looks like a language alone', () => {
    expect(sitePath('https://iua.example.test/help')).toBe('/help');
    expect(sitePath('https://iua.example.test/he')).toBe('/');
  });

  it('never keeps a link that carries a token or a fragment', () => {
    expect(sitePath('https://iua.example.test/he/reset-password?token=abc')).toBeNull();
    expect(sitePath('https://iua.example.test/he/news/x#top')).toBeNull();
  });

  it('gives nothing for something that is not an address', () => {
    expect(sitePath('http://')).toBeNull();
  });
});

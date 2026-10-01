import sharp from 'sharp';
import { FileRejected, cleanName, prepareUpload } from './file-processing';

const jpegWithExif = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Fictional Photographer', Copyright: 'demo-secret-marker' } })
    .toBuffer();

const png = (width = 32, height = 32) =>
  sharp({ create: { width, height, channels: 4, background: '#ffffff00' } })
    .png()
    .toBuffer();

const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FileRejected) return error.code;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('prepareUpload', () => {
  it('re-encodes images and drops their metadata', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await prepareUpload(input, 'photo.JPG', 'CONTENT');
    expect(result).toMatchObject({ kind: 'IMAGE', mimeType: 'image/jpeg', width: 64, height: 48 });
    const meta = await sharp(result.body).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(result.body.includes('demo-secret-marker')).toBe(false);
    expect(result.thumbnail).not.toBeNull();
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drops anything appended to an image (polyglot files)', async () => {
    const input = Buffer.concat([await png(), Buffer.from('<script>alert(1)</script>')]);
    const result = await prepareUpload(input, 'x.png', 'CONTENT');
    expect(result.body.includes('<script>')).toBe(false);
  });

  it('shrinks large images and crops profile photos square', async () => {
    const big = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#000000' },
    })
      .jpeg()
      .toBuffer();
    expect(await prepareUpload(big, 'wide.jpg', 'CONTENT')).toMatchObject({
      width: 2400,
      height: 1200,
    });
    expect(await prepareUpload(big, 'me.jpg', 'PROFILE_PHOTO')).toMatchObject({
      width: 1024,
      height: 1024,
    });
  });

  it('takes the type from the content, not the name', async () => {
    const result = await prepareUpload(pdf(), 'report.jpg', 'CONTENT');
    expect(result).toMatchObject({
      kind: 'DOCUMENT',
      mimeType: 'application/pdf',
      originalName: 'report.pdf',
      thumbnail: null,
    });
    expect(result.body).toEqual(pdf()); // documents are stored as uploaded
  });

  it('refuses SVG, HTML, unknown and empty files', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
    expect(await rejection(prepareUpload(svg, 'a.svg', 'CONTENT'))).toBe('fileTypeNotAllowed');
    const html = Buffer.from('<!doctype html><html><body>hi</body></html>');
    expect(await rejection(prepareUpload(html, 'a.pdf', 'CONTENT'))).toBe('fileTypeNotAllowed');
    const text = Buffer.from('just some text pretending to be a document');
    expect(await rejection(prepareUpload(text, 'a.docx', 'CONTENT'))).toBe('fileTypeNotAllowed');
    expect(await rejection(prepareUpload(Buffer.alloc(0), 'a.png', 'CONTENT'))).toBe('fileEmpty');
  });

  it('allows only images as profile photos, up to 5 MB', async () => {
    expect(await rejection(prepareUpload(pdf(), 'me.pdf', 'PROFILE_PHOTO'))).toBe(
      'fileTypeNotAllowed',
    );
    const large = Buffer.concat([await png(), Buffer.alloc(5 * 1024 * 1024)]);
    expect(await rejection(prepareUpload(large, 'me.png', 'PROFILE_PHOTO'))).toBe('fileTooLarge');
  });

  it('enforces the size limit per type', async () => {
    const hugeImage = Buffer.concat([await png(), Buffer.alloc(10 * 1024 * 1024)]);
    expect(await rejection(prepareUpload(hugeImage, 'x.png', 'CONTENT'))).toBe('fileTooLarge');
  });

  it('refuses images that decode to too many pixels', async () => {
    const bomb = await sharp({
      create: { width: 7200, height: 7200, channels: 3, background: '#000000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    expect(await rejection(prepareUpload(bomb, 'bomb.png', 'CONTENT'))).toBe('fileUnreadable');
  });

  it('refuses a broken image', async () => {
    const broken = (await png()).subarray(0, 60);
    expect(await rejection(prepareUpload(broken, 'x.png', 'CONTENT'))).toBe('fileUnreadable');
  });
});

describe('cleanName', () => {
  it('keeps a readable name with the real extension', () => {
    expect(cleanName('C:\\Users\\x\\Annual report.JPG', 'pdf')).toBe('Annual report.pdf');
    expect(cleanName('../../etc/passwd', 'pdf')).toBe('passwd.pdf');
    expect(cleanName('דו״ח שנתי.pdf', 'pdf')).toBe('דו״ח שנתי.pdf');
    expect(cleanName('a<b>:"|?*\u0007.pdf', 'pdf')).toBe('ab.pdf');
    expect(cleanName('.pdf', 'pdf')).toBe('file.pdf');
  });
});

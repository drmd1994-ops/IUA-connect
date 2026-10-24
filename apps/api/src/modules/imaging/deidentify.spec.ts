import { type DicomDataset } from 'dcmjs';
import { PLANTED, readScan as read, sampleScan } from '../../testing/sample-scan';
import { ScanRejected, deidentify, newUid } from './deidentify';

const scan = (overrides: DicomDataset = {}) => sampleScan({ overrides });

describe('removing a patient’s details from a scan (M36)', () => {
  it('leaves none of the planted details anywhere in the stored file', () => {
    const { instance } = deidentify(scan(), new Map());
    const bytes = instance.body.toString('latin1');
    for (const planted of [...Object.values(PLANTED), 'Cohen', 'HOSPITAL_PACS', '1.2.3.4']) {
      expect(bytes).not.toContain(planted);
    }
    expect(JSON.stringify(instance.metadata)).not.toMatch(/Cohen|123456782|20260901|Made-up/);
  });

  it('keeps what the image needs, and leaves the required patient fields empty', () => {
    const { instance } = deidentify(scan(), new Map());
    const { dict, meta } = read(instance.body);
    expect(dict['00280010']?.Value).toEqual([4]);
    expect(dict['00280004']?.Value).toEqual(['MONOCHROME2']);
    expect(dict['7FE00010']).toBeDefined();
    expect(dict['00100010']?.Value ?? []).toEqual([]);
    expect(dict['00120062']?.Value).toEqual(['YES']);
    expect(meta['00020003']?.Value).toEqual([instance.sopInstanceUid]);
    const frame = (dict['52009230']?.Value?.[0] as DicomDataset)['00209113'];
    expect((frame?.Value?.[0] as DicomDataset)['00200032']?.Value).toEqual([1, 2, 3]);
    expect(instance).toMatchObject({ modality: 'CT', seriesNumber: 3, instanceNumber: 7 });
    expect(instance.metadata['7FE00010']).toBeUndefined();
  });

  it('gives a series the same new identifiers across files of one upload', () => {
    const uids = new Map<string, string>();
    const a = deidentify(scan(), uids).instance;
    const b = deidentify(scan(), uids).instance;
    expect(a.studyUid).toBe(b.studyUid);
    expect(a.seriesUid).toBe(b.seriesUid);
    expect(a.sopInstanceUid).not.toBe(b.sopInstanceUid);
    expect(a.studyUid).not.toBe('1.2.3.4');
    expect(a.studyUid).toMatch(/^2\.25\.\d+$/);
  });

  it('refuses a file that is not a scan, has no image, or says text is burned in', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof ScanRejected ? error.code : 'other';
      }
      return null;
    };
    expect(code(() => deidentify(Buffer.from('not a scan at all'), new Map()))).toBe(
      'scanNotDicom',
    );
    const noImage = scan();
    const parsed = read(noImage);
    delete parsed.dict['7FE00010'];
    expect(code(() => deidentify(Buffer.from(parsed.write()), new Map()))).toBe('scanNoImage');
    expect(
      code(() => deidentify(scan({ '00280301': { vr: 'CS', Value: ['YES'] } }), new Map())),
    ).toBe('scanBurnedIn');
  });

  it('makes valid identifiers', () => {
    const uid = newUid();
    expect(uid.length).toBeLessThanOrEqual(64);
    expect(uid).toMatch(/^2\.25\.[1-9]\d*$/);
  });
});

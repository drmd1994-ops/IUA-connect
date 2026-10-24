import { type DicomDataset, data } from 'dcmjs';

/** Made-up details planted in a made-up scan, for tests that check none of them survives. */
export const PLANTED = {
  name: 'Cohen^Avraham',
  id: '123456782',
  birth: '19580214',
  studyDate: '20260901',
  institution: 'Made-up Medical Center',
  physician: 'Levi^Dana',
  privateText: 'PRIVATE-VENDOR-NOTE',
  frameTime: '20260901101500',
  description: 'CT ABDOMEN Cohen',
};

/** A tiny made-up CT image (4 × 4 pixels) as a DICOM file, carrying the planted details. */
export function sampleScan(
  options: {
    study?: string;
    series?: string;
    instance?: string;
    number?: number;
    overrides?: DicomDataset;
  } = {},
): Buffer {
  const study = options.study ?? '1.2.3.4';
  const series = options.series ?? `${study}.5`;
  const instance = options.instance ?? `${series}.${options.number ?? 1}`;
  const meta: DicomDataset = {
    '00020001': { vr: 'OB', Value: [new Uint8Array([0, 1]).buffer] },
    '00020002': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    '00020003': { vr: 'UI', Value: [instance] },
    '00020010': { vr: 'UI', Value: ['1.2.840.10008.1.2.1'] },
    '00020016': { vr: 'AE', Value: ['HOSPITAL_PACS'] },
  };
  const dict: DicomDataset = {
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    '00080018': { vr: 'UI', Value: [instance] },
    '00080020': { vr: 'DA', Value: [PLANTED.studyDate] },
    '00080060': { vr: 'CS', Value: ['CT'] },
    '00080080': { vr: 'LO', Value: [PLANTED.institution] },
    '00080090': { vr: 'PN', Value: [{ Alphabetic: PLANTED.physician }] },
    '0008103E': { vr: 'LO', Value: [PLANTED.description] },
    '00091010': { vr: 'LO', Value: [PLANTED.privateText] },
    '00100010': { vr: 'PN', Value: [{ Alphabetic: PLANTED.name }] },
    '00100020': { vr: 'LO', Value: [PLANTED.id] },
    '00100030': { vr: 'DA', Value: [PLANTED.birth] },
    '0020000D': { vr: 'UI', Value: [study] },
    '0020000E': { vr: 'UI', Value: [series] },
    '00200011': { vr: 'IS', Value: [3] },
    '00200013': { vr: 'IS', Value: [options.number ?? 7] },
    '00200052': { vr: 'UI', Value: [`${study}.9`] },
    '00280002': { vr: 'US', Value: [1] },
    '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
    '00280010': { vr: 'US', Value: [4] },
    '00280011': { vr: 'US', Value: [4] },
    '00280100': { vr: 'US', Value: [16] },
    '00280101': { vr: 'US', Value: [12] },
    '00280102': { vr: 'US', Value: [11] },
    '00280103': { vr: 'US', Value: [0] },
    '52009230': {
      vr: 'SQ',
      Value: [
        {
          '00209111': {
            vr: 'SQ',
            Value: [{ '00189074': { vr: 'DT', Value: [PLANTED.frameTime] } }],
          },
          '00209113': {
            vr: 'SQ',
            Value: [{ '00200032': { vr: 'DS', Value: [1, 2, 3] } }],
          },
        },
      ],
    },
    '7FE00010': { vr: 'OW', Value: [new Uint16Array(16).fill(100).buffer] },
    ...options.overrides,
  };
  const file = new data.DicomDict(meta);
  file.dict = dict;
  return Buffer.from(file.write());
}

/** Reads a DICOM file back. */
export function readScan(body: Buffer) {
  return data.DicomMessage.readFile(
    body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  );
}

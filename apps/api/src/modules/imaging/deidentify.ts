import { randomUUID } from 'node:crypto';
import { type DicomDataset, type DicomElement, data } from 'dcmjs';

/**
 * Removing a patient's details from a scan (M36 plan §3), before anything is stored.
 *
 * It keeps only an allow-list: the attributes needed to draw and measure the image. Everything
 * else goes, named or not: the patient's and the hospital's details, dates, free text, the
 * device's private attributes and overlays (which can carry burned-in text). The study, series,
 * instance and frame-of-reference identifiers are replaced by new ones, the same across one upload,
 * so the series still line up. What is left on the image itself is the author's to confirm.
 */

/** A file this module refuses; `code` is the error the person sees. */
export class ScanRejected extends Error {
  constructor(readonly code: ScanRejectCode) {
    super(code);
  }
}
export type ScanRejectCode = 'scanNotDicom' | 'scanNoImage' | 'scanBurnedIn';

/** The attributes kept, by tag. Everything else is dropped. */
const KEEP = new Set([
  '00080005', // Specific Character Set
  '00080008', // Image Type
  '00080016', // SOP Class UID
  '00080060', // Modality
  '00180015', // Body Part Examined
  '00180050', // Slice Thickness
  '00180060', // KVP
  '00180080', // Repetition Time
  '00180081', // Echo Time
  '00180082', // Inversion Time
  '00180087', // Magnetic Field Strength
  '00180088', // Spacing Between Slices
  '00181164', // Imager Pixel Spacing
  '00181314', // Flip Angle
  '00185100', // Patient Position (head first, supine…)
  '00186011', // Sequence of Ultrasound Regions (for measuring)
  '00200011', // Series Number
  '00200012', // Acquisition Number
  '00200013', // Instance Number
  '00200020', // Patient Orientation (the image's directions)
  '00200032', // Image Position (Patient)
  '00200037', // Image Orientation (Patient)
  '00201041', // Slice Location
  '00280002', // Samples per Pixel
  '00280004', // Photometric Interpretation
  '00280006', // Planar Configuration
  '00280008', // Number of Frames
  '00280009', // Frame Increment Pointer
  '00280010', // Rows
  '00280011', // Columns
  '00280030', // Pixel Spacing
  '00280034', // Pixel Aspect Ratio
  '00280100', // Bits Allocated
  '00280101', // Bits Stored
  '00280102', // High Bit
  '00280103', // Pixel Representation
  '00280106', // Smallest Image Pixel Value
  '00280107', // Largest Image Pixel Value
  '00281050', // Window Center
  '00281051', // Window Width
  '00281052', // Rescale Intercept
  '00281053', // Rescale Slope
  '00281054', // Rescale Type
  '00281101', // Palette descriptors (red, green, blue)
  '00281102',
  '00281103',
  '00281201', // Palette data (red, green, blue)
  '00281202',
  '00281203',
  '00282110', // Lossy Image Compression
  '00282112', // Lossy Image Compression Ratio
  '00282114', // Lossy Image Compression Method
  '00283000', // Modality LUT Sequence
  '00283010', // VOI LUT Sequence
  '52009229', // Shared Functional Groups Sequence (multi-frame geometry)
  '52009230', // Per-frame Functional Groups Sequence
  '7FE00010', // Pixel Data
]);

/** Identifiers replaced by new ones, kept consistent across one upload. */
const STUDY_UID = '0020000D';
const SERIES_UID = '0020000E';
const FRAME_OF_REFERENCE_UID = '00200052';
const SOP_INSTANCE_UID = '00080018';
const BURNED_IN_ANNOTATION = '00280301';
const PIXEL_DATA = '7FE00010';

/** The file-meta attributes kept; the instance's identifier is set anew. */
const KEEP_META = new Set(['00020001', '00020002', '00020010']);
const MEDIA_STORAGE_SOP_INSTANCE_UID = '00020003';
const TRANSFER_SYNTAX_UID = '00020010';
const IMPLEMENTATION_CLASS_UID = '00020012';
const DEFLATED = '1.2.840.10008.1.2.1.99';
const EXPLICIT_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
/** Ours, under the UUID-derived root 2.25 (PS3.5 B.2), fixed. */
const IMPLEMENTATION_UID = '2.25.97316436081927513358190734567124509';

/** Empty, but present: the standard requires these attributes to exist. */
const EMPTY: Record<string, string> = {
  '00080020': 'DA', // Study Date
  '00080030': 'TM', // Study Time
  '00080050': 'SH', // Accession Number
  '00080090': 'PN', // Referring Physician's Name
  '00100010': 'PN', // Patient's Name
  '00100020': 'LO', // Patient ID
  '00100030': 'DA', // Patient's Birth Date
  '00100040': 'CS', // Patient's Sex
  '00200010': 'SH', // Study ID
};
const PATIENT_IDENTITY_REMOVED = '00120062';
const DEIDENTIFICATION_METHOD = '00120063';

/** Binary values, left out of the metadata the viewer reads (it reads them from the file). */
const BULK_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'UN']);

/** A new DICOM identifier, from a random UUID (PS3.5 B.2). */
export function newUid(): string {
  return `2.25.${BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString()}`;
}

export interface CleanInstance {
  body: Buffer;
  studyUid: string;
  seriesUid: string;
  sopInstanceUid: string;
  sopClassUid: string;
  modality: string;
  seriesNumber: number | null;
  instanceNumber: number | null;
  /** The instance's attributes as DICOM JSON (PS3.18 F), without the binary ones. */
  metadata: Record<string, unknown>;
}

/**
 * One file, cleaned. `uids` maps the original study, series and frame-of-reference identifiers
 * to their replacements; the caller keeps it for the whole upload. `originalStudyUid` is returned
 * separately so the caller can refuse an upload with more than one study.
 */
export function deidentify(
  input: Buffer,
  uids: Map<string, string>,
): { instance: CleanInstance; originalStudyUid: string } {
  let parsed;
  try {
    const bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    parsed = data.DicomMessage.readFile(bytes as ArrayBuffer);
  } catch {
    throw new ScanRejected('scanNotDicom');
  }
  const source = parsed.dict;
  if (!source[PIXEL_DATA]) throw new ScanRejected('scanNoImage');
  if (text(source[BURNED_IN_ANNOTATION])?.toUpperCase() === 'YES') {
    throw new ScanRejected('scanBurnedIn');
  }
  const originalStudyUid = text(source[STUDY_UID]);
  const originalSeriesUid = text(source[SERIES_UID]);
  const sopClassUid = text(source['00080016']);
  if (!originalStudyUid || !originalSeriesUid || !sopClassUid) {
    throw new ScanRejected('scanNotDicom');
  }

  const dict: DicomDataset = {};
  for (const [tag, element] of Object.entries(source)) {
    if (KEEP.has(tag)) dict[tag] = element.vr === 'SQ' ? cleanSequence(element) : element;
  }
  const map = (original: string) => {
    let replaced = uids.get(original);
    if (!replaced) uids.set(original, (replaced = newUid()));
    return replaced;
  };
  const studyUid = map(originalStudyUid);
  const seriesUid = map(originalSeriesUid);
  const sopInstanceUid = newUid();
  dict[STUDY_UID] = { vr: 'UI', Value: [studyUid] };
  dict[SERIES_UID] = { vr: 'UI', Value: [seriesUid] };
  dict[SOP_INSTANCE_UID] = { vr: 'UI', Value: [sopInstanceUid] };
  const frame = text(source[FRAME_OF_REFERENCE_UID]);
  if (frame) dict[FRAME_OF_REFERENCE_UID] = { vr: 'UI', Value: [map(frame)] };
  for (const [tag, vr] of Object.entries(EMPTY)) dict[tag] = { vr, Value: [] };
  dict[PATIENT_IDENTITY_REMOVED] = { vr: 'CS', Value: ['YES'] };
  dict[DEIDENTIFICATION_METHOD] = { vr: 'LO', Value: ['Med Connect allow-list (M36)'] };

  const meta: DicomDataset = {};
  for (const [tag, element] of Object.entries(parsed.meta)) {
    if (KEEP_META.has(tag)) meta[tag] = element;
  }
  meta[MEDIA_STORAGE_SOP_INSTANCE_UID] = { vr: 'UI', Value: [sopInstanceUid] };
  meta[IMPLEMENTATION_CLASS_UID] = { vr: 'UI', Value: [IMPLEMENTATION_UID] };
  // A deflated file is read inflated, and is written so.
  if (text(meta[TRANSFER_SYNTAX_UID]) === DEFLATED) {
    meta[TRANSFER_SYNTAX_UID] = { vr: 'UI', Value: [EXPLICIT_LITTLE_ENDIAN] };
  }

  const out = new data.DicomDict(meta);
  out.dict = dict;
  let body: Buffer;
  try {
    body = Buffer.from(out.write({ allowInvalidVRLength: true }));
  } catch {
    throw new ScanRejected('scanNotDicom');
  }
  return {
    originalStudyUid,
    instance: {
      body,
      studyUid,
      seriesUid,
      sopInstanceUid,
      sopClassUid,
      modality: text(dict['00080060'])?.slice(0, 16) || 'OT',
      seriesNumber: integer(dict['00200011']),
      instanceNumber: integer(dict['00200013']),
      metadata: toJson(dict),
    },
  };
}

/**
 * Inside a kept sequence (geometry per frame, ultrasound regions, look-up tables) only numbers and
 * coded values stay: dates, times, names, free text, identifiers and private attributes go.
 */
const DROP_IN_SEQUENCE = new Set([
  'AE',
  'DA',
  'DT',
  'LO',
  'LT',
  'PN',
  'SH',
  'ST',
  'TM',
  'UC',
  'UI',
  'UR',
  'UT',
]);

function cleanSequence(element: DicomElement): DicomElement {
  const items = (element.Value ?? []).map((item) => {
    const out: DicomDataset = {};
    for (const [tag, inner] of Object.entries(item as DicomDataset)) {
      if (isPrivate(tag) || DROP_IN_SEQUENCE.has(inner.vr)) continue;
      out[tag] = inner.vr === 'SQ' ? cleanSequence(inner) : inner;
    }
    return out;
  });
  return { vr: 'SQ', Value: items };
}

/** Private attributes have an odd group number. */
function isPrivate(tag: string): boolean {
  return parseInt(tag.slice(0, 4), 16) % 2 === 1;
}

function text(element: DicomElement | undefined): string | null {
  const value = element?.Value?.[0];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integer(element: DicomElement | undefined): number | null {
  const value = Number(element?.Value?.[0]);
  return Number.isInteger(value) && Math.abs(value) < 2 ** 31 ? value : null;
}

/** DICOM JSON of a dataset, without binary values; sequences are converted item by item. */
function toJson(dataset: DicomDataset): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [tag, element] of Object.entries(dataset)) {
    if (BULK_VRS.has(element.vr)) continue;
    const values = element.Value ?? [];
    if (element.vr === 'SQ') {
      out[tag] = { vr: 'SQ', Value: values.map((item) => toJson(item as DicomDataset)) };
    } else {
      out[tag] = values.length ? { vr: element.vr, Value: values } : { vr: element.vr };
    }
  }
  return out;
}

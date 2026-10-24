/** The small part of dcmjs (MIT) that the imaging module uses (M36). dcmjs ships no types. */
declare module 'dcmjs' {
  export interface DicomElement {
    vr: string;
    Value?: unknown[];
    /** Raw bytes some readers keep next to the value; never written by us. */
    _rawValue?: unknown;
  }
  export type DicomDataset = Record<string, DicomElement>;

  export class DicomDict {
    constructor(meta: DicomDataset);
    meta: DicomDataset;
    dict: DicomDataset;
    write(options?: { allowInvalidVRLength?: boolean }): ArrayBuffer;
  }

  export const data: {
    DicomDict: typeof DicomDict;
    DicomMessage: {
      readFile(buffer: ArrayBuffer, options?: { ignoreErrors?: boolean }): DicomDict;
    };
  };
}

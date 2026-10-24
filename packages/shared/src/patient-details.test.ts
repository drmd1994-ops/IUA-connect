import { describe, expect, it } from 'vitest';
import { findPatientDetails, validIsraeliId } from './patient-details';

/** The ID numbers here are made up; valid ones pass the check digit, and belong to nobody known. */
const kinds = (text: string) => findPatientDetails(text).map((detail) => detail.kind);

describe('the patient-details check (M25)', () => {
  it('knows a valid Israeli ID number by its check digit', () => {
    expect(validIsraeliId('000000018')).toBe(true);
    expect(validIsraeliId('123456782')).toBe(true);
    expect(validIsraeliId('123456789')).toBe(false);
    expect(validIsraeliId('000000000')).toBe(false);
  });

  it('finds an ID number, a phone number, a full date and an email address', () => {
    expect(kinds('ת"ז 123456782 נבדק')).toEqual(['idNumber']);
    expect(kinds('call him on 052-1234567')).toEqual(['phone']);
    expect(kinds('נולד ב־12/03/1961')).toEqual(['date']);
    expect(kinds('seen on 2026-10-01')).toEqual(['date']);
    expect(kinds('wrote to dana@example.test')).toEqual(['email']);
  });

  it('finds a record number and a patient’s name after their labels', () => {
    expect(kinds('MRN: 4471923')).toEqual(['recordNumber']);
    expect(kinds('מספר תיק 88231')).toEqual(['recordNumber']);
    expect(kinds('Patient name: Avi Cohen')).toEqual(['patientName']);
    expect(kinds('שם המטופל: משה לוי')).toEqual(['patientName']);
  });

  it('finds a name after a title, in English and Hebrew (M26)', () => {
    expect(kinds('Mr Cohen presented with pain')).toEqual(['patientName']);
    expect(kinds('We saw Mrs. Levi in clinic')).toEqual(['patientName']);
    expect(kinds('מר כהן הגיע עם כאב')).toEqual(['patientName']);
    expect(kinds('נבדקה גב׳ לוי במרפאה')).toEqual(['patientName']);
    expect(kinds("גב' לוי")).toEqual(['patientName']);
    expect(kinds('הגברת לוי התקבלה')).toEqual(['patientName']);
  });

  it('lets the back, a bitter taste, the gallbladder and MRI through', () => {
    expect(kinds('כאב גב תחתון כבר שבוע')).toEqual([]);
    expect(kinds('מתלונן על טעם מר בפה')).toEqual([]);
    expect(kinds('אבנים בכיס המרה')).toEqual([]);
    expect(kinds('MRI of the pelvis, then mr. scan reviewed')).toEqual([]);
  });

  it('says where, in the order found, once for each stretch of text', () => {
    expect(findPatientDetails('MRN 123456782, born 01.02.1970')).toEqual([
      { kind: 'recordNumber', text: 'MRN 123456782' },
      { kind: 'date', text: '01.02.1970' },
    ]);
  });

  it('lets ordinary medical text through', () => {
    for (const text of [
      'A 67-year-old man with a PSA of 12.4 ng/mL and a Gleason score of 4+3.',
      'Tamsulosin 0.4 mg once a day; follow-up in 3 months.',
      'גבר בן 58, אבן של 9 מ״מ בשופכן הימני, קריאטינין 1.1.',
      'Guidelines from 2024 recommend active surveillance.',
      'eGFR 45 mL/min/1.73 m², stage G3a.',
      'A 123456789 that fails the check digit is not an ID number.',
      'Seen in March 2026, and again in the autumn.',
    ]) {
      expect(findPatientDetails(text), text).toEqual([]);
    }
  });
});

import { type IdentifierKind } from '../identifier';
import { readImport } from './rows';

const types = new Map<string, IdentifierKind>([
  ['FULL_MEMBER', 'SPECIALIST_CERTIFICATE'],
  ['RESIDENT', 'MEDICAL_LICENCE'],
  ['STUDENT', 'NONE'],
]);
const today = new Date('2026-09-29T00:00:00Z');
const header =
  'email,first_name,last_name,membership_type,identifier,end_date,payment_status,locale';
const read = (...lines: string[]) => readImport([header, ...lines].join('\n'), types, today);

describe('readImport', () => {
  it('reads valid rows with defaults', () => {
    const { fileErrors, rows } = read(
      'Noa@Example.test,Noa,Levi,full_member,12345,,,',
      'tal@example.test,טל,כהן,STUDENT,,2027-12-31,PAID,en',
    );
    expect(fileErrors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      email: 'noa@example.test',
      reasons: [],
      record: {
        typeKey: 'FULL_MEMBER',
        identifier: '12345',
        endDate: new Date('2026-12-31T00:00:00Z'),
        paymentStatus: null,
        locale: 'he',
      },
    });
    expect(rows[1]!.record).toMatchObject({
      firstName: 'טל',
      identifier: null,
      endDate: new Date('2027-12-31T00:00:00Z'),
      paymentStatus: 'PAID',
      locale: 'en',
    });
  });

  it('accepts columns in any order and optional columns left out', () => {
    const { fileErrors, rows } = readImport(
      'MEMBERSHIP_TYPE,Email,Last_Name,First_Name\nSTUDENT,a@example.test,B,A',
      types,
      today,
    );
    expect(fileErrors).toEqual([]);
    expect(rows[0]!.record).toMatchObject({ email: 'a@example.test', firstName: 'A' });
  });

  it('explains every problem in a row', () => {
    const { rows } = read('not-an-email,,Levi,SURGEON,,31/12/2026,FREE,fr');
    expect(rows[0]).toMatchObject({
      email: null,
      record: null,
      reasons: [
        'invalidEmail',
        'invalidName',
        'unknownMembershipType',
        'invalidEndDate',
        'invalidPaymentStatus',
        'invalidLocale',
      ],
    });
    expect(read('a@example.test,A,B,FULL_MEMBER,,,,').rows[0]!.reasons).toEqual([
      'identifierRequired',
    ]);
    expect(read('a@example.test,A,B,STUDENT,99,,,').rows[0]!.reasons).toEqual([
      'identifierNotExpected',
    ]);
    expect(read('a@example.test,A,B,STUDENT,,2025-12-31,,').rows[0]!.reasons).toEqual([
      'endDateInPast',
    ]);
    expect(read('a@example.test,A,B,STUDENT,,2026-02-30,,').rows[0]!.reasons).toEqual([
      'invalidEndDate',
    ]);
    expect(read('a@example.test,A,B').rows[0]!.reasons).toContain('wrongColumnCount');
  });

  it('flags duplicates within the file', () => {
    const { rows } = read(
      'a@example.test,A,B,FULL_MEMBER,111,,,',
      'A@example.test,A,B,STUDENT,,,,',
      'c@example.test,C,D,FULL_MEMBER,111,,,',
      'd@example.test,C,D,RESIDENT,111,,,',
    );
    expect(rows.map((r) => r.reasons)).toEqual([
      [],
      ['duplicateEmail'],
      ['duplicateIdentifier'],
      [], // a licence number, not a certificate number
    ]);
  });

  it('rejects files with the wrong columns or no rows', () => {
    expect(readImport('email,first_name,last_name,type\nx', types, today).fileErrors).toEqual([
      { code: 'unknownColumn', column: 'type' },
      { code: 'missingColumn', column: 'membership_type' },
    ]);
    expect(readImport(header, types, today).fileErrors).toEqual([{ code: 'noRows' }]);
    expect(readImport('', types, today).fileErrors).toEqual([{ code: 'emptyFile' }]);
    expect(readImport(`${header}\n"open`, types, today).fileErrors).toEqual([
      { code: 'unterminatedQuote', line: 2 },
    ]);
  });
});

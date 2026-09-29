/**
 * Reference data for M2 (docs/plans/M2-people-membership.md §3). The seed inserts rows that are
 * missing and never overwrites what admins have since edited: the database is the source of truth
 * for names and flags once a row exists. Real hospital names are acceptable (DATABASE_DESIGN.md
 * §6); every person in the system is fictional.
 */

export interface MembershipTypeSeed {
  key: string;
  nameHe: string;
  nameEn: string;
  identifier: 'NONE' | 'SPECIALIST_CERTIFICATE' | 'MEDICAL_LICENCE';
  selfApply: boolean;
  directorApproval: boolean;
}

/** Owner answers to O3 and the M2 plan §11 (2026-09-29). */
export const MEMBERSHIP_TYPES: MembershipTypeSeed[] = [
  {
    key: 'FULL_MEMBER',
    nameHe: 'חברות מלאה',
    nameEn: 'Full member',
    identifier: 'SPECIALIST_CERTIFICATE',
    selfApply: true,
    directorApproval: true,
  },
  {
    key: 'NON_FULL_MEMBER',
    nameHe: 'חברות שאינה מלאה',
    nameEn: 'Non-full member',
    identifier: 'MEDICAL_LICENCE',
    selfApply: true,
    directorApproval: true,
  },
  {
    key: 'RESIDENT',
    nameHe: 'מתמחה',
    nameEn: 'Resident',
    identifier: 'MEDICAL_LICENCE',
    selfApply: true,
    directorApproval: true,
  },
  {
    key: 'STUDENT',
    nameHe: 'סטודנט/ית',
    nameEn: 'Student',
    identifier: 'NONE',
    selfApply: true,
    directorApproval: false,
  },
  {
    key: 'HONORARY_MEMBER',
    nameHe: 'חברות כבוד',
    nameEn: 'Honorary member',
    identifier: 'NONE',
    selfApply: false,
    directorApproval: false,
  },
];

/** The 11 subspecialties of spec §17. */
export const SUBSPECIALTIES: { key: string; nameHe: string; nameEn: string }[] = [
  { key: 'URO_ONCOLOGY', nameHe: 'אורו־אונקולוגיה', nameEn: 'Uro-oncology' },
  { key: 'ENDOUROLOGY', nameHe: 'אנדואורולוגיה', nameEn: 'Endourology' },
  { key: 'FUNCTIONAL', nameHe: 'אורולוגיה תפקודית', nameEn: 'Functional urology' },
  { key: 'PEDIATRIC', nameHe: 'אורולוגיה ילדים', nameEn: 'Pediatric urology' },
  { key: 'ANDROLOGY', nameHe: 'אנדרולוגיה', nameEn: 'Andrology' },
  { key: 'RECONSTRUCTIVE', nameHe: 'אורולוגיה שחזורית', nameEn: 'Reconstructive urology' },
  { key: 'TRANSPLANT', nameHe: 'השתלות', nameEn: 'Transplant' },
  { key: 'FEMALE', nameHe: 'אורולוגיה נשית', nameEn: 'Female urology' },
  { key: 'COMMUNITY', nameHe: 'אורולוגיה בקהילה', nameEn: 'Community urology' },
  { key: 'UROLITHIASIS', nameHe: 'אבנים בדרכי השתן', nameEn: 'Urolithiasis' },
  { key: 'ROBOTIC', nameHe: 'ניתוחים רובוטיים', nameEn: 'Robotic surgery' },
];

export interface HospitalSeed {
  code: string;
  nameHe: string;
  nameEn: string;
  cityHe: string;
  cityEn: string;
}

/** Israeli hospitals with a urology department. Each gets one "urology" department. */
export const HOSPITALS: HospitalSeed[] = [
  {
    code: 'rambam',
    nameHe: 'רמב״ם – הקריה הרפואית לבריאות האדם',
    nameEn: 'Rambam Health Care Campus',
    cityHe: 'חיפה',
    cityEn: 'Haifa',
  },
  {
    code: 'sheba',
    nameHe: 'המרכז הרפואי שיבא, תל השומר',
    nameEn: 'Sheba Medical Center, Tel HaShomer',
    cityHe: 'רמת גן',
    cityEn: 'Ramat Gan',
  },
  {
    code: 'sourasky',
    nameHe: 'המרכז הרפואי תל אביב ע״ש סוראסקי (איכילוב)',
    nameEn: 'Tel Aviv Sourasky Medical Center (Ichilov)',
    cityHe: 'תל אביב–יפו',
    cityEn: 'Tel Aviv-Yafo',
  },
  {
    code: 'hadassah-ein-kerem',
    nameHe: 'הדסה עין כרם',
    nameEn: 'Hadassah Ein Kerem',
    cityHe: 'ירושלים',
    cityEn: 'Jerusalem',
  },
  {
    code: 'shaare-zedek',
    nameHe: 'המרכז הרפואי שערי צדק',
    nameEn: 'Shaare Zedek Medical Center',
    cityHe: 'ירושלים',
    cityEn: 'Jerusalem',
  },
  {
    code: 'rabin',
    nameHe: 'המרכז הרפואי רבין (בילינסון)',
    nameEn: 'Rabin Medical Center (Beilinson)',
    cityHe: 'פתח תקווה',
    cityEn: 'Petah Tikva',
  },
  {
    code: 'soroka',
    nameHe: 'המרכז הרפואי האוניברסיטאי סורוקה',
    nameEn: 'Soroka University Medical Center',
    cityHe: 'באר שבע',
    cityEn: "Be'er Sheva",
  },
  {
    code: 'meir',
    nameHe: 'המרכז הרפואי מאיר',
    nameEn: 'Meir Medical Center',
    cityHe: 'כפר סבא',
    cityEn: 'Kfar Saba',
  },
  {
    code: 'shamir',
    nameHe: 'המרכז הרפואי שמיר (אסף הרופא)',
    nameEn: 'Shamir Medical Center (Assaf Harofeh)',
    cityHe: 'באר יעקב',
    cityEn: "Be'er Ya'akov",
  },
  {
    code: 'wolfson',
    nameHe: 'המרכז הרפואי וולפסון',
    nameEn: 'Wolfson Medical Center',
    cityHe: 'חולון',
    cityEn: 'Holon',
  },
  {
    code: 'kaplan',
    nameHe: 'המרכז הרפואי קפלן',
    nameEn: 'Kaplan Medical Center',
    cityHe: 'רחובות',
    cityEn: 'Rehovot',
  },
  {
    code: 'hillel-yaffe',
    nameHe: 'המרכז הרפואי הלל יפה',
    nameEn: 'Hillel Yaffe Medical Center',
    cityHe: 'חדרה',
    cityEn: 'Hadera',
  },
  {
    code: 'bnai-zion',
    nameHe: 'המרכז הרפואי בני ציון',
    nameEn: 'Bnai Zion Medical Center',
    cityHe: 'חיפה',
    cityEn: 'Haifa',
  },
  {
    code: 'carmel',
    nameHe: 'המרכז הרפואי כרמל',
    nameEn: 'Carmel Medical Center',
    cityHe: 'חיפה',
    cityEn: 'Haifa',
  },
  {
    code: 'galilee',
    nameHe: 'המרכז הרפואי לגליל',
    nameEn: 'Galilee Medical Center',
    cityHe: 'נהריה',
    cityEn: 'Nahariya',
  },
  {
    code: 'emek',
    nameHe: 'המרכז הרפואי העמק',
    nameEn: 'Emek Medical Center',
    cityHe: 'עפולה',
    cityEn: 'Afula',
  },
  {
    code: 'ziv',
    nameHe: 'המרכז הרפואי זיו',
    nameEn: 'Ziv Medical Center',
    cityHe: 'צפת',
    cityEn: 'Safed',
  },
  {
    code: 'barzilai',
    nameHe: 'המרכז הרפואי ברזילי',
    nameEn: 'Barzilai Medical Center',
    cityHe: 'אשקלון',
    cityEn: 'Ashkelon',
  },
  {
    code: 'assuta-ashdod',
    nameHe: 'אסותא אשדוד',
    nameEn: 'Assuta Ashdod',
    cityHe: 'אשדוד',
    cityEn: 'Ashdod',
  },
  {
    code: 'laniado',
    nameHe: 'המרכז הרפואי לניאדו',
    nameEn: 'Laniado Medical Center',
    cityHe: 'נתניה',
    cityEn: 'Netanya',
  },
  {
    code: 'poriya',
    nameHe: 'המרכז הרפואי פוריה',
    nameEn: 'Poriya Medical Center',
    cityHe: 'טבריה',
    cityEn: 'Tiberias',
  },
];

export const UROLOGY_DEPARTMENT = {
  code: 'urology',
  nameHe: 'המחלקה האורולוגית',
  nameEn: 'Department of Urology',
};

import type { AppSettings } from '../types/api';
import { sortByKhmer } from './sort';

// The report card's layout (Settings → Report card). The school's real template has not been seen yet, so the card is configurable:
// which blocks it has, how many signature boxes (0-3) with which captions, a closing note and the order of the subjects.
// The DEFAULTS are today's card exactly (a photo is the only block that did not exist, and it starts off).
export interface ReportCardOptions {
  showLogo: boolean;
  /** Only lets the card leave the national header out; the header itself is switched on in Settings → Printed reports. */
  showNationalHeader: boolean;
  showPhoto: boolean;
  showAttendance: boolean;
  showRank: boolean;
  showComment: boolean;
  /** The captions of the signature boxes in order; '' means that box's default caption. 0 to 3 of them. */
  signatures: string[];
  footerNote: string;
  subjectOrder: 'default' | 'name';
  /** Under a main subject made of sub-subjects, list the sub-subjects and their scores (off: the card lists main subjects only). */
  showSubSubjects: boolean;
}

export const MAX_SIGNATURES = 3;
export const CAPTION_MAX = 60;
export const FOOTER_NOTE_MAX = 200;

const flag = (values: AppSettings, key: string, fallback: boolean): boolean => (values[key] === undefined ? fallback : values[key] === 'true');

/** The card's options from the settings the server sent (anything missing or odd falls back to the default). */
export function cardOptionsFrom(values: AppSettings): ReportCardOptions {
  const raw = values['card.signatureCount'] ?? '1';
  const signatures = /^[0-3]$/.test(raw) ? Number(raw) : 1;   // (Number('') is 0: only a single digit 0-3 counts)
  return {
    showLogo: flag(values, 'card.showLogo', true),
    showNationalHeader: flag(values, 'card.showNationalHeader', true),
    showPhoto: flag(values, 'card.showPhoto', false),
    showAttendance: flag(values, 'card.showAttendance', true),
    showRank: flag(values, 'card.showRank', true),
    showComment: flag(values, 'card.showComment', true),
    signatures: [1, 2, 3].slice(0, signatures).map((n) => (values[`card.signature${n}`] ?? '').trim()),
    footerNote: (values['card.footerNote'] ?? '').trim(),
    subjectOrder: values['card.subjectOrder'] === 'name' ? 'name' : 'default',
    showSubSubjects: flag(values, 'card.showSubSubjects', false),
  };
}

export const DEFAULT_CARD_OPTIONS: ReportCardOptions = cardOptionsFrom({});

/** The settings to save for these options (all of them, so a saved card never depends on what was stored before). */
export function cardSettingsOf(options: ReportCardOptions): AppSettings {
  const caption = (i: number): string => (options.signatures[i] ?? '').trim();
  return {
    'card.showLogo': String(options.showLogo),
    'card.showNationalHeader': String(options.showNationalHeader),
    'card.showPhoto': String(options.showPhoto),
    'card.showAttendance': String(options.showAttendance),
    'card.showRank': String(options.showRank),
    'card.showComment': String(options.showComment),
    'card.signatureCount': String(options.signatures.length),
    'card.signature1': caption(0),
    'card.signature2': caption(1),
    'card.signature3': caption(2),
    'card.footerNote': options.footerNote.trim(),
    'card.subjectOrder': options.subjectOrder,
    'card.showSubSubjects': String(options.showSubSubjects),
  };
}

/** The subjects as the card lists them: in the order of the school's subject list, or by Khmer alphabet. */
export function orderSubjects<T extends { subjectName: string }>(subjects: T[], order: ReportCardOptions['subjectOrder']): T[] {
  return order === 'name' ? sortByKhmer(subjects, (s) => s.subjectName) : subjects;
}

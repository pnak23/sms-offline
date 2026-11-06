import { khmerDigitsToAscii, parseWholeNumber } from './khmer';

// Scores, maximums, weights and percentages are stored as whole hundredths, so people may type at most two decimals.
const DECIMAL = /^\d{1,6}(\.\d{1,2})?$/;

/** A number typed by a person: Khmer or Arabic digits, "," or "." as the decimal mark, at most two decimals. NaN when it is not one. */
export function parseDecimal(text: string): number {
  const ascii = khmerDigitsToAscii(text).trim().replace(',', '.');
  return DECIMAL.test(ascii) ? Number(ascii) : Number.NaN;
}

/** A whole number from min to max: the number, `'invalid'` when the text is not a whole number (or is empty), `'range'` when it is outside. */
export function parseWholeNumberInRange(text: string, min: number, max: number): number | 'invalid' | 'range' {
  const n = parseWholeNumber(text);
  if (Number.isNaN(n)) return 'invalid';
  return n < min || n > max ? 'range' : n;
}

/** 8.5 -> "8.5", 100 -> "100", 52.8571 -> "52.86"; null / undefined -> "". At most two decimals, no trailing zeros. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(Math.round(value * 100) / 100);
}

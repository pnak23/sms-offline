// Khmer digit helpers. Inputs accept Khmer digits; values are stored as ASCII digits (docs section 9).
const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';

export function khmerDigitsToAscii(value: string): string {
  let out = '';
  for (const ch of value) {
    const index = KHMER_DIGITS.indexOf(ch);
    out += index >= 0 ? String(index) : ch;
  }
  return out;
}

export function asciiDigitsToKhmer(value: string): string {
  let out = '';
  for (const ch of value) out += ch >= '0' && ch <= '9' ? KHMER_DIGITS.charAt(Number(ch)) : ch;
  return out;
}

/** Whole numbers only; accepts Khmer digits and surrounding spaces. NaN when the text is not a plain integer. */
export function parseWholeNumber(value: string): number {
  const text = khmerDigitsToAscii(value).trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : Number.NaN;
}

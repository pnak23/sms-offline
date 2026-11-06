import type { FeeCurrency } from '../types/api';
import { khmerDigitsToAscii } from './khmer';

const DECIMALS: Record<FeeCurrency, number> = { KHR: 0, USD: 2 };
const SYMBOL: Record<FeeCurrency, string> = { KHR: '៛', USD: '$' };

export const FEE_CURRENCIES: readonly FeeCurrency[] = ['KHR', 'USD'];

/** 15000 KHR -> "15,000៛"; 12.5 USD -> "$12.50". Digits stay Arabic here; the printed pages convert them when Khmer numerals are on. */
export function formatMoney(amount: number, currency: FeeCurrency): string {
  const text = new Intl.NumberFormat('en-US', { minimumFractionDigits: DECIMALS[currency], maximumFractionDigits: DECIMALS[currency] }).format(amount);
  return currency === 'USD' ? `${SYMBOL.USD}${text}` : `${text}${SYMBOL.KHR}`;
}

/**
 * An amount typed by a person: Khmer or Arabic digits, spaces and thousands commas ignored, "." as the decimal mark. Riel have no
 * decimals, dollars at most two (the server refuses anything finer). NaN when it is not an amount above 0.
 */
export function parseMoney(text: string, currency: FeeCurrency): number {
  const ascii = khmerDigitsToAscii(text).replace(/[\s,]/g, '');
  const pattern = DECIMALS[currency] === 0 ? /^\d{1,12}$/ : /^\d{1,12}(\.\d{1,2})?$/;
  if (!pattern.test(ascii)) return Number.NaN;
  const n = Number(ascii);
  return n > 0 && n <= 1_000_000_000_000 ? n : Number.NaN;
}

/** A default amount may also be 0 ("ask each time"); an empty box counts as 0. NaN when it is not an amount. */
export function parseDefaultAmount(text: string, currency: FeeCurrency): number {
  return text.trim() === '' || khmerDigitsToAscii(text).trim() === '0' ? 0 : parseMoney(text, currency);
}

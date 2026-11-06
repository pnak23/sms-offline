import { asciiDigitsToKhmer } from './khmer';

// Printed pages can show Khmer digits (the "Khmer numerals" setting). Doing it on the finished page, instead of in every template,
// covers every number, date and code on every printed page — including text that Vue changes later.
/** Parts of a page that keep their digits: form controls, scripts, and anything marked data-keep-digits. The toolbar is not printed. */
const SKIP = 'input, textarea, select, script, style, .no-print, [data-keep-digits]';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Turns the Arabic digits of every text under `node` into Khmer digits. */
export function convertDigits(node: Node): void {
  if (node.nodeType === TEXT_NODE) {
    const text = node.nodeValue ?? '';
    if (/[0-9]/.test(text) && !node.parentElement?.closest(SKIP)) node.nodeValue = asciiDigitsToKhmer(text);
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  if ((node as Element).matches(SKIP)) return;
  node.childNodes.forEach(convertDigits);
}

/** Converts `root` now and keeps converting whatever is added or changed inside it. Call the returned function to stop. */
export function keepKhmerNumerals(root: Node): () => void {
  convertDigits(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') convertDigits(record.target);
      else record.addedNodes.forEach(convertDigits);
    }
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}

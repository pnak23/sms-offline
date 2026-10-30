const UI_FONT = 'Noto Sans Khmer';
const KHMER_SAMPLE = 'កខគ';

/**
 * True when the BUNDLED Khmer UI font was really loaded from our own files. `document.fonts.check()` alone is not
 * enough: it also says "true" when the family is merely installed on this PC, which would hide a broken bundle
 * (docs R14). So the font is requested and the @font-face entry must report status "loaded".
 */
export async function isBundledFontLoaded(family: string = UI_FONT): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  try {
    await document.fonts.ready;
    await document.fonts.load(`400 1em "${family}"`, KHMER_SAMPLE);
  } catch {
    return false;
  }
  const faces: FontFace[] = [];
  document.fonts.forEach((face) => faces.push(face));
  const bundled = faces.some((face) => face.family.replace(/["']/g, '') === family && face.status === 'loaded');
  return bundled && document.fonts.check(`1em "${family}"`, KHMER_SAMPLE);
}

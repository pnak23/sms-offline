// The artwork of the roll of honour (តារាងកិត្តិយស): twenty original styles (the first ten, then ten more added on 2026-11-06), drawn as SVG by code. No image files,
// no licensed artwork, nothing fetched at run time. The first ten are never edited: a test keeps a fingerprint of how each is drawn.
// A style is three pieces: the frame around ONE name (the "plate", viewBox 320 x 120), one page corner (drawn at the top-left and mirrored to the other three),
// and the flourish under the national header. The markup is built only from the constants in this file (never from anything a person typed), so it is safe to
// show with v-html.
// Gold and the other metals are a short diagonal gradient that REPEATS (spreadMethod reflect): every stroke, whatever its direction, crosses light and dark
// bands like polished metal. (A tall vertical gradient left every horizontal line one flat pale colour.)

/** The first ten are the original styles (order and drawing never change); the next ten were added later and come after them in the picker. */
export const HONOR_STYLE_IDS = [
  'classic', 'lotus', 'angkor', 'star', 'royal', 'laurel', 'guilloche', 'kids', 'mono', 'sun',
  'kbach', 'rice', 'palm', 'rose', 'moon', 'book', 'flag', 'vintage', 'modern', 'wave',
] as const;
export type HonorStyleId = (typeof HONOR_STYLE_IDS)[number];
export const DEFAULT_HONOR_STYLE: HonorStyleId = 'classic';

export const isHonorStyleId = (value: unknown): value is HonorStyleId => (HONOR_STYLE_IDS as readonly unknown[]).includes(value);

/** What the page around the artwork needs: the colours of the title and the text, and where a name sits on a plate (plate units, 320 x 120). */
export interface HonorLook {
  title: string;
  text: string;
  nameColor: string;
  nameBox: { cy: number; w: number };
}

type Pt = readonly [number, number];
type Bez = readonly [Pt, Pt, Pt, Pt];
type Stop = readonly [number, string];
type Paints = { m: string; p: string; g: string; n: string; r: string; s: string };
type PaintKey = keyof Paints;
type PaintSpec = readonly [PaintKey, readonly Stop[], boolean?];
type Kind = 'plate' | 'page' | 'div';
interface Colors { line: string; leaf: string; dark: string; silver: string }
interface Ctx extends Paints { defs: string; c: Colors }
/** The page border of a style added after the first ten (the first ten keep the fixed double rule written in pageSvg): its distance from the edge, the width of the
 *  outer rule, and the inner rule (width 0 = none; `paint` is the paint it uses, the main one when left out; `gap` is the distance between the rules), and optionally a
 *  third rule inside the second (its width; it uses the main paint, so a border can be blue, red, blue). */
interface PageFrame { inset: number; outer: number; inner: number; gap: number; paint?: PaintKey; third?: number }
interface Art extends HonorLook {
  id: HonorStyleId;
  colors: Colors;
  paints: readonly PaintSpec[];
  page?: PageFrame;
  plate(P: Ctx): string;
  corner(P: Ctx): string;
  divider(P: Ctx): string;
}

// ---------- drawing helpers ----------
const n = (v: number): number => Math.round(v * 100) / 100;
const colors = (line: string, more: Partial<Colors> = {}): Colors => ({ line, leaf: line, dark: line, silver: line, ...more });
const LEAF = (len: number, wid: number): string => `M0 0C${n(wid)} ${n(-len * 0.2)} ${n(wid * 0.9)} ${n(-len * 0.7)} 0 ${n(-len)}C${n(-wid * 0.9)} ${n(-len * 0.7)} ${n(-wid)} ${n(-len * 0.2)} 0 0Z`;
const FLAME = 'M0 0C-9 -6 -12 -16 -6 -25C-3 -30 0 -33 0 -40C6 -34 12 -27 10 -18C9 -10 5 -3 0 0Z';
const at = (x: number, y: number, rot = 0, s = 1): string => `translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${s})`;
const mirror = (cx: number, inner: string): string => `<g transform="translate(${2 * cx} 0) scale(-1 1)">${inner}</g>`;
const both = (cx: number, inner: string): string => inner + mirror(cx, inner);
const flipV = (cy: number, inner: string): string => `<g transform="translate(0 ${2 * cy}) scale(1 -1)">${inner}</g>`;

const spiral = (cx: number, cy: number, r: number, turns: number, dir = 1, start = 0, k = 0.86): string => {
  const steps = Math.max(8, Math.round(turns * 30));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + dir * t * turns * 2 * Math.PI;
    const rad = r * (1 - k * t);
    d += `${i ? 'L' : 'M'}${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`;
  }
  return d;
};

/** A point on a cubic curve and the direction (degrees) the curve is heading there. */
const bez = (p: Bez, t: number): { x: number; y: number; deg: number } => {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
  const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
  return { x, y, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
};
const bezPath = (p: Bez): string => `M${p[0][0]} ${p[0][1]}C${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]}`;

const star = (cx: number, cy: number, R: number, r: number, pts = 5, rot = -90): string => {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = ((rot + (i * 180) / pts) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`;
  }
  return `${d}Z`;
};

const BAND: Record<Kind, readonly [number, number]> = { plate: [46, 34], page: [120, 88], div: [40, 18] };
const grad = (id: string, kind: Kind, stops: readonly Stop[], horizontal: boolean, w: number): string => {
  const [vx, vy] = BAND[kind];
  const v = horizontal ? `x2="${w}" y2="0"` : `x2="${vx}" y2="${vy}"`;
  const stopTags = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" ${v}${horizontal ? '' : ' spreadMethod="reflect"'}>${stopTags}</linearGradient>`;
};
const GOLD: readonly Stop[] = [[0, '#fbe98e'], [0.3, '#dfae36'], [0.58, '#97680f'], [0.82, '#e6bb44'], [1, '#fbe98e']];

/** A tapered stroke: a polygon that follows `pts` and narrows from w0 to w1 (a brush-like swash), used for the filigree scrolls. */
const taper = (pts: readonly Pt[], w0: number, w1: number): string => {
  const left: string[] = [];
  const right: string[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)] ?? p;
    const b = pts[Math.min(pts.length - 1, i + 1)] ?? p;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const t = i / Math.max(1, pts.length - 1);
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.75)) / 2;
    left.push(`${n(p[0] - dy * w)} ${n(p[1] + dx * w)}`);
    right.push(`${n(p[0] + dy * w)} ${n(p[1] - dx * w)}`);
  });
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
};

/** The points of a swash that leaves a cubic curve and rolls up into a spiral (a volute), joined smoothly at the tangent. */
const scrollPts = (p: Bez, r: number, turns: number, dir = 1, k = 0.85): Pt[] => {
  const pts: Pt[] = Array.from({ length: 25 }, (_, i) => {
    const b = bez(p, i / 24);
    return [b.x, b.y] as const;
  });
  const end = bez(p, 1);
  const tx = Math.cos((end.deg * Math.PI) / 180);
  const ty = Math.sin((end.deg * Math.PI) / 180);
  const a0 = dir === 1 ? Math.atan2(-tx, ty) : Math.atan2(tx, -ty);
  const cx = end.x - r * Math.cos(a0);
  const cy = end.y - r * Math.sin(a0);
  const steps = Math.round(turns * 30);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + dir * t * turns * 2 * Math.PI;
    const rad = r * (1 - k * t);
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
};
const swash = (P: Ctx, p: Bez, r: number, turns: number, dir: number, w0: number, w1: number, sw = 0.5): string =>
  `<path d="${taper(scrollPts(p, r, turns, dir), w0, w1)}" fill="${P.m}" stroke="${P.c.line}" stroke-width="${sw}" stroke-linejoin="round"/>`;

const strokeM = (P: Ctx, sw = 2.4, extra = ''): string => `fill="none" stroke="${P.m}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
const leafAt = (x: number, y: number, len: number, wid: number, rot: number, fill: string, stroke: string, sw = 0.7): string =>
  `<path transform="${at(x, y, rot)}" d="${LEAF(len, wid)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

/** One <svg>'s drawing context: its own gradient ids (an id must never be shared between svgs of different size) and ready-made paints. */
function context(art: Art, kind: Kind, w: number): Ctx {
  const uid = (s: string): string => `honor-${art.id}-${kind}-${s}`;
  const paints: Paints = { m: '', p: '', g: '', n: '', r: '', s: '' };
  const defs: string[] = [];
  for (const [key, stops, horizontal] of art.paints) {
    defs.push(grad(uid(key), kind, stops, horizontal === true, w));
    paints[key] = `url(#${uid(key)})`;
  }
  return { ...paints, defs: `<defs>${defs.join('')}</defs>`, c: art.colors };
}

// ---------- 1. classic gold: filigree scrolls, like a gold certificate ----------
const classic: Art = {
  // the colours of the owner's real sample: a gold title (olive gold), everything else plain black
  id: 'classic', title: '#876c0b', text: '#1c1c1c', nameColor: '#222222', nameBox: { cy: 60, w: 190 },
  colors: colors('#6b4a0c'),
  paints: [['m', GOLD]],
  plate(P) {
    const D = P.c.line;
    const L = (x: number, y: number, len: number, wid: number, rot: number): string => leafAt(x, y, len, wid, rot, P.m, D, 0.6);
    const up: Bez = [[104, 38], [88, 20], [60, 12], [44, 26]];
    const end: Bez = [[60, 50], [42, 47], [26, 53], [24, 65]];
    const half = [
      swash(P, up, 10, 1.55, 1, 6, 1), flipV(60, swash(P, up, 10, 1.55, 1, 6, 1)),
      swash(P, end, 6.5, 1.45, 1, 4.6, 0.9), flipV(60, swash(P, end, 6.5, 1.45, 1, 4.6, 0.9)),
      swash(P, [[160, 38], [148, 34], [136, 27], [132, 14]], 7.5, 1.5, -1, 5, 0.9),
      L(118, 37, 17, 6, -34), L(136, 36, 15, 5.4, -20), L(98, 40, 14, 5, -52),
      flipV(60, L(118, 37, 14, 5, -34) + L(136, 36, 12, 4.6, -20)),
    ].join('');
    return [
      `<rect x="52" y="36" width="216" height="48" rx="24" fill="#fffdf2" stroke="${P.m}" stroke-width="4.4"/>`,
      `<rect x="52" y="36" width="216" height="48" rx="24" fill="none" stroke="${D}" stroke-width=".6"/>`,
      `<rect x="59" y="43" width="202" height="34" rx="17" fill="none" stroke="${P.m}" stroke-width="1.5"/>`,
      both(160, half),
      L(160, 38, 31, 9.5, 0), L(160, 38, 25, 8.2, 31), L(160, 38, 25, 8.2, -31), L(160, 38, 17, 6.4, 60), L(160, 38, 17, 6.4, -60),
      `<circle cx="160" cy="3.4" r="2.8" fill="${P.m}" stroke="${D}" stroke-width=".5"/>`,
      L(160, 82, 20, 8, 180), L(160, 82, 16, 7, 212), L(160, 82, 16, 7, 148), L(160, 82, 11, 5, 244), L(160, 82, 11, 5, 116),
      `<circle cx="160" cy="112" r="2.8" fill="${P.m}" stroke="${D}" stroke-width=".5"/>`,
    ].join('');
  },
  corner(P) {
    const D = P.c.line;
    const L = (len: number, wid: number, rot: number): string => leafAt(28, 28, len, wid, rot, P.m, D, 0.6);
    const edge = swash(P, [[170, 26], [120, 22], [80, 28], [56, 48]], 14, 1.6, 1, 6, 1);
    return [
      edge, `<g transform="matrix(0 1 1 0 0 0)">${edge}</g>`,
      L(70, 12, 135), L(58, 10, 113), L(58, 10, 157), L(46, 8, 91), L(46, 8, 179),
      `<circle cx="28" cy="28" r="5" fill="${P.m}" stroke="${D}" stroke-width=".6"/>`,
    ].join('');
  },
  divider(P) {
    const D = P.c.line;
    return both(150, `<path d="M16 13H78" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/>${swash(P, [[116, 14], [102, 5], [84, 6], [78, 14]], 5.5, 1.3, 1, 3.4, 0.8, 0.4)}`)
      + `<path d="M150 3L159 13L150 23L141 13Z" fill="${P.m}" stroke="${D}" stroke-width=".6"/><circle cx="132" cy="13" r="2" fill="${P.m}"/><circle cx="168" cy="13" r="2" fill="${P.m}"/>`;
  },
};

// ---------- 2. lotus ----------
const lotusPetals = (P: Ctx, x: number, y: number, scale = 1): string => {
  const set: readonly Pt[] = [[-68, 15], [68, 15], [-45, 22], [45, 22], [-22, 27], [22, 27], [0, 31]];
  return set.map(([rot, len]) => leafAt(x, y, len * scale, 10 * scale, rot, P.p, P.c.line, 0.8)).join('');
};
const lotus: Art = {
  id: 'lotus', title: '#a8275f', text: '#5a1237', nameColor: '#5a1237', nameBox: { cy: 61, w: 190 },
  colors: colors('#a8275f', { leaf: '#2a6e28' }),
  paints: [['m', [[0, '#f7a8c8'], [0.5, '#c93678'], [1, '#8e1f55']]], ['p', [[0, '#ffe3ef'], [0.55, '#f08fb7'], [1, '#d44a86']]], ['g', [[0, '#a6d77f'], [0.55, '#4f9a3a'], [1, '#27682a']]]],
  plate(P) {
    const lv = (x: number, y: number, rot: number): string => `<g transform="${at(x, y, rot)}"><ellipse cx="0" cy="0" rx="25" ry="11" fill="${P.g}" stroke="${P.c.leaf}" stroke-width="1"/><path d="M-25 0L22 0M-14 0L-6 -8M-14 0L-6 8M0 0L9 -7M0 0L9 7" stroke="${P.c.leaf}" stroke-width=".8" fill="none"/></g>`;
    return [
      both(160, `${lv(32, 64, -10)}<path d="M52 38C58 24 66 22 72 28C68 34 62 36 58 40Z" fill="${P.p}" stroke="${P.c.line}" stroke-width=".8"/>`),
      `<rect x="52" y="38" width="216" height="46" rx="23" fill="#fffafc" stroke="${P.m}" stroke-width="3"/>`,
      `<rect x="57" y="43" width="206" height="36" rx="18" fill="none" stroke="${P.c.line}" stroke-width=".8" opacity=".7"/>`,
      lotusPetals(P, 160, 38),
      `<ellipse cx="160" cy="38" rx="15" ry="4.5" fill="${P.g}" stroke="${P.c.leaf}" stroke-width=".8"/>`,
      `<path d="M112 94Q160 108 208 94" fill="none" stroke="#4f9aa0" stroke-width="1.4" stroke-linecap="round"/><path d="M130 101Q160 111 190 101" fill="none" stroke="#4f9aa0" stroke-width="1.2" stroke-linecap="round"/><path d="M146 107Q160 113 174 107" fill="none" stroke="#4f9aa0" stroke-width="1" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    const lf = (len: number, rot: number): string => leafAt(22, 22, len, 11, rot, P.g, P.c.leaf, 0.8);
    const flower = `<g transform="translate(40 40) rotate(135)">${lotusPetals(P, 0, 0)}</g>`;
    return [lf(66, 90), lf(66, 180), lf(46, 135), flower, `<circle cx="40" cy="40" r="3" fill="#f3c63a"/>`].join('');
  },
  divider(P) {
    const bud = (x: number): string => lotusPetals(P, x, 22, 0.42);
    return both(150, `<path d="M20 20C60 20 80 18 118 20" ${strokeM(P, 1.4, 'opacity=".9"')}/>${bud(100)}${bud(60)}`) + lotusPetals(P, 150, 24, 0.55);
  },
};

// ---------- 3. Angkor towers ----------
const tower = (cx: number, base: number, w: number, tiers: number, tierH: number, fill: string, stroke: string): string => {
  let s = '';
  for (let i = 0; i < tiers; i++) {
    const half = (w / 2) * (1 - i * 0.26);
    const y = base - (i + 1) * tierH;
    s += `<path d="M${n(cx - half - 2)} ${n(y + tierH)}H${n(cx + half + 2)}L${n(cx + half)} ${n(y)}H${n(cx - half)}Z" fill="${fill}" stroke="${stroke}" stroke-width=".7"/>`;
  }
  const top = base - tiers * tierH;
  return `${s}<path d="M${n(cx)} ${n(top - tierH * 1.5)}C${n(cx + 4)} ${n(top - tierH * 0.6)} ${n(cx + 5)} ${n(top - tierH * 0.2)} ${n(cx + 2)} ${n(top)}H${n(cx - 2)}C${n(cx - 5)} ${n(top - tierH * 0.2)} ${n(cx - 4)} ${n(top - tierH * 0.6)} ${n(cx)} ${n(top - tierH * 1.5)}Z" fill="${fill}" stroke="${stroke}" stroke-width=".7"/>`;
};
const angkor: Art = {
  id: 'angkor', title: '#6b4318', text: '#3e2810', nameColor: '#3e2810', nameBox: { cy: 66, w: 190 },
  colors: colors('#6b4a1b'),
  paints: [['m', [[0, '#e8c987'], [0.45, '#b98a42'], [1, '#6e4a1b']]]],
  plate(P) {
    const D = P.c.line;
    return [
      tower(160, 40, 36, 3, 9, P.m, D), both(160, tower(112, 40, 26, 2, 8, P.m, D)),
      `<path d="M52 92V50H72V46H92V42H228V46H248V50H268V92Z" fill="#fffaf0" stroke="${D}" stroke-width="2.6" stroke-linejoin="round"/>`,
      `<path d="M58 87V55H78V51H98V47H222V51H242V55H262V87Z" fill="none" stroke="${P.m}" stroke-width="1.2"/>`,
      both(160, `<path d="M36 92V52H46V92M24 92V62H34V92" fill="${P.m}" stroke="${D}" stroke-width=".7"/>`),
      `<path d="M46 96H274V104H46Z" fill="${P.m}" stroke="${D}" stroke-width=".8"/><path d="M60 104H260V111H60Z" fill="${P.m}" stroke="${D}" stroke-width=".8"/>`,
    ].join('');
  },
  corner(P) {
    const D = P.c.line;
    return [
      `<path d="M0 0H78V12H12V78H0Z" fill="${P.m}" stroke="${D}" stroke-width=".8"/>`,
      `<path d="M24 24H54V32H32V54H24Z" fill="${P.m}" stroke="${D}" stroke-width=".8"/>`,
      `<rect x="40" y="40" width="7" height="7" fill="${P.m}" stroke="${D}" stroke-width=".6"/>`,
    ].join('');
  },
  divider(P) {
    return both(150, `<path d="M20 20H108V14H116V20" ${strokeM(P, 1.5)}/>${tower(96, 20, 9, 2, 4, P.m, P.c.line)}`) + tower(150, 24, 18, 3, 5, P.m, P.c.line);
  },
};

// ---------- 4. stars and ribbon (navy and gold) ----------
const starRibbon: Art = {
  id: 'star', title: '#14316f', text: '#10265a', nameColor: '#ffffff', nameBox: { cy: 63, w: 176 },
  colors: colors('#0c2155', { dark: '#0b1d4c' }),
  paints: [['m', GOLD], ['n', [[0, '#2c55a8'], [1, '#12296b']]]],
  plate(P) {
    const tail = `<path d="M16 46H62V92H16L31 69Z" fill="${P.c.dark}" stroke="${P.m}" stroke-width="1.6" stroke-linejoin="round"/><path d="M62 86V98L76 86Z" fill="#050f2e"/>`;
    return [
      both(160, tail),
      `<rect x="58" y="40" width="204" height="46" fill="${P.n}"/><path d="M58 40H262M58 86H262" stroke="${P.m}" stroke-width="3"/><rect x="64" y="46" width="192" height="34" fill="none" stroke="${P.m}" stroke-width="1"/>`,
      `<path d="${star(160, 22, 17, 7)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".8"/>`,
      both(160, `<path d="${star(112, 30, 8, 3.4)}" fill="${P.m}"/><path d="${star(74, 100, 5, 2.2)}" fill="${P.m}"/>`),
      `<path d="M138 30H146M174 30H182" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    return [
      `<path d="${star(40, 40, 30, 12, 8, -90)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".8"/>`,
      `<path d="M72 40H150M40 72V150" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/>`,
      `<path d="${star(110, 40, 6, 2.6)}" fill="${P.m}"/><path d="${star(40, 110, 6, 2.6)}" fill="${P.m}"/>`,
    ].join('');
  },
  divider(P) {
    return both(150, `<path d="M20 13H118" stroke="${P.m}" stroke-width="1.6"/><path d="${star(100, 13, 6, 2.6)}" fill="${P.m}"/>`) + `<path d="${star(150, 13, 11, 4.6)}" fill="${P.m}"/>`;
  },
};

// ---------- 5. royal red and gold (stylised flames; not an authentic Khmer pattern) ----------
const flame = (x: number, y: number, rot: number, s: number, fill: string, stroke: string): string =>
  `<g transform="${at(x, y, rot, s)}"><path d="${FLAME}" fill="${fill}" stroke="${stroke}" stroke-width="${n(1 / s)}" stroke-linejoin="round"/><path d="M0 -6C-3 -15 -3 -23 0 -32" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${n(1.2 / s)}" stroke-linecap="round"/></g>`;
const royal: Art = {
  id: 'royal', title: '#8d0f1b', text: '#5b0710', nameColor: '#5b0710', nameBox: { cy: 61, w: 176 },
  colors: colors('#6e0a14'),
  paints: [['m', GOLD], ['r', [[0, '#d03244'], [0.5, '#9a1220'], [1, '#d03244']]]],
  plate(P) {
    const D = P.c.line;
    const side = flame(50, 61, -90, 1.0, P.m, D) + flame(52, 48, -58, 0.8, P.r, D) + flame(52, 74, -122, 0.8, P.r, D) + flame(56, 40, -30, 0.52, P.m, D) + flame(56, 82, -150, 0.52, P.m, D);
    return [
      both(160, side),
      flame(160, 38, 0, 1.0, P.m, D), flame(152, 38, -30, 0.82, P.r, D), flame(168, 38, 30, 0.82, P.r, D), flame(144, 39, -58, 0.6, P.m, D), flame(176, 39, 58, 0.6, P.m, D),
      `<rect x="58" y="38" width="204" height="46" rx="23" fill="#fff9ef" stroke="${P.r}" stroke-width="4"/><rect x="64" y="44" width="192" height="34" rx="17" fill="none" stroke="${P.m}" stroke-width="1.8"/>`,
      `<path d="M126 92H194" stroke="${P.m}" stroke-width="2.2" stroke-linecap="round"/><circle cx="160" cy="101" r="3.4" fill="${P.r}" stroke="${P.m}" stroke-width="1"/><circle cx="144" cy="97" r="2.2" fill="${P.m}"/><circle cx="176" cy="97" r="2.2" fill="${P.m}"/>`,
    ].join('');
  },
  corner(P) {
    const D = P.c.line;
    return [flame(30, 30, 92, 1.05, P.r, D), flame(30, 30, 178, 1.05, P.r, D), flame(30, 30, 135, 1.6, P.m, D),
      `<path d="M92 26H190M26 92V190" stroke="${P.r}" stroke-width="1.6" stroke-linecap="round"/><circle cx="26" cy="26" r="4.4" fill="${P.r}" stroke="${P.m}" stroke-width="1"/>`].join('');
  },
  divider(P) {
    const D = P.c.line;
    return both(150, `<path d="M20 20H108" stroke="${P.r}" stroke-width="1.6"/>${flame(122, 22, 72, 0.4, P.m, D)}${flame(104, 22, 0, 0.32, P.r, D)}`)
      + flame(150, 24, 0, 0.58, P.m, D) + flame(140, 24, -34, 0.42, P.r, D) + flame(160, 24, 34, 0.42, P.r, D);
  },
};

// ---------- 6. laurel wreath ----------
const laurel: Art = {
  id: 'laurel', title: '#23611c', text: '#173d12', nameColor: '#173d12', nameBox: { cy: 61, w: 168 },
  colors: colors('#1f4d18'),
  paints: [['m', GOLD], ['g', [[0, '#9ad06a'], [0.5, '#4d9a38'], [1, '#235f23']]]],
  plate(P) {
    const path: Bez = [[158, 104], [74, 112], [14, 78], [50, 30]];
    let leaves = '';
    for (let i = 0; i < 11; i++) {
      const b = bez(path, 0.06 + i * 0.088);
      leaves += leafAt(b.x, b.y, 19 - i * 0.5, 6.4, b.deg + 90 + (i % 2 ? 1 : -1) * 42, P.g, P.c.line, 0.6);
    }
    leaves += leafAt(path[3][0], path[3][1], 16, 6, bez(path, 1).deg + 90, P.g, P.c.line, 0.6);
    const branch = `<path d="${bezPath(path)}" fill="none" stroke="${P.c.line}" stroke-width="1.6" stroke-linecap="round"/>${leaves}`;
    return [
      both(160, branch),
      `<rect x="66" y="38" width="188" height="46" rx="23" fill="#fbfff7" stroke="${P.m}" stroke-width="3"/><rect x="71" y="43" width="178" height="36" rx="18" fill="none" stroke="${P.c.line}" stroke-width=".7" opacity=".7"/>`,
      `<path d="${star(160, 22, 10, 4.2)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".7"/>`,
      `<path d="M160 106C146 96 136 100 138 108C140 114 154 110 160 106C166 110 180 114 182 108C184 100 174 96 160 106Z" fill="${P.m}" stroke="${P.c.line}" stroke-width=".7"/><path d="M158 108L150 118M162 108L170 118" stroke="${P.m}" stroke-width="2.4" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    const path: Bez = [[18, 130], [18, 60], [50, 22], [130, 18]];
    let leaves = '';
    for (let i = 0; i < 10; i++) {
      const b = bez(path, 0.06 + i * 0.098);
      leaves += leafAt(b.x, b.y, 17, 6, b.deg + 90 + (i % 2 ? 1 : -1) * 44, P.g, P.c.line, 0.6);
    }
    return `<path d="${bezPath(path)}" fill="none" stroke="${P.c.line}" stroke-width="1.5" stroke-linecap="round"/>${leaves}<circle cx="18" cy="18" r="3.4" fill="${P.m}"/>`;
  },
  divider(P) {
    const path: Bez = [[20, 18], [50, 8], [86, 8], [118, 16]];
    let leaves = '';
    for (let i = 0; i < 6; i++) {
      const b = bez(path, 0.08 + i * 0.17);
      leaves += leafAt(b.x, b.y, 9, 3.4, b.deg + 90 + (i % 2 ? 1 : -1) * 44, P.g, P.c.line, 0.4);
    }
    return both(150, `<path d="${bezPath(path)}" fill="none" stroke="${P.c.line}" stroke-width="1" stroke-linecap="round"/>${leaves}`) + `<path d="${star(150, 13, 8, 3.4)}" fill="${P.m}"/>`;
  },
};

// ---------- 7. blue guilloche (woven lines) ----------
const wave = (x0: number, x1: number, y: number, amp: number, period: number, phase: number): string => {
  let d = '';
  for (let x = x0; x <= x1; x += 2) d += `${x === x0 ? 'M' : 'L'}${x} ${n(y + amp * Math.sin(((x - x0) / period) * 2 * Math.PI + phase))}`;
  return d;
};
const guilloche: Art = {
  id: 'guilloche', title: '#12306e', text: '#0e2556', nameColor: '#0e2556', nameBox: { cy: 60, w: 176 },
  colors: colors('#12306e', { silver: '#98a3b8' }),
  paints: [['m', [[0, '#3d62b4'], [0.5, '#16397f'], [1, '#0d2559']]], ['s', [[0, '#f2f5fa'], [0.5, '#a9b3c7'], [1, '#6c768c']]]],
  plate(P) {
    const oct = (i: number): string => {
      const x0 = 50 + i;
      const x1 = 270 - i;
      const y0 = 30 + i;
      const y1 = 90 - i;
      const c = 18 - i * 0.6;
      return `M${x0 + c} ${y0}H${x1 - c}L${x1} ${y0 + c}V${y1 - c}L${x1 - c} ${y1}H${x0 + c}L${x0} ${y1 - c}V${y0 + c}Z`;
    };
    const ros = (x: number, y: number): string => Array.from({ length: 12 }, (_, k) => `<ellipse transform="${at(x, y, k * 30)}" cx="0" cy="-8" rx="3.2" ry="8" fill="${P.s}" stroke="${P.c.line}" stroke-width=".6"/>`).join('') + `<circle cx="${x}" cy="${y}" r="4" fill="${P.m}"/>`;
    const band = (y: number): string => `<path d="${wave(96, 224, y, 5, 32, 0)}" ${strokeM(P, 1.6)}/><path d="${wave(96, 224, y, 5, 32, Math.PI)}" fill="none" stroke="${P.s}" stroke-width="1.6"/>`;
    return [
      band(19), band(101),
      `<path d="${oct(0)}" fill="#f7faff" stroke="${P.m}" stroke-width="3.2" stroke-linejoin="round"/><path d="${oct(6)}" fill="none" stroke="${P.s}" stroke-width="1.4" stroke-linejoin="round"/><path d="${oct(9)}" fill="none" stroke="${P.m}" stroke-width=".7"/>`,
      both(160, ros(26, 60)), `<path d="M160 8L168 18L160 28L152 18Z" fill="${P.m}" stroke="${P.s}" stroke-width="1"/>`,
    ].join('');
  },
  corner(P) {
    const ros = Array.from({ length: 12 }, (_, k) => `<ellipse transform="${at(38, 38, k * 30)}" cx="0" cy="-12" rx="4.4" ry="12" fill="${P.s}" stroke="${P.c.line}" stroke-width=".7"/>`).join('');
    return [`<path d="M20 70A50 50 0 0 1 70 20" ${strokeM(P, 1.6)}/><path d="M20 94A74 74 0 0 1 94 20" fill="none" stroke="${P.s}" stroke-width="1.6"/><path d="M20 118A98 98 0 0 1 118 20" ${strokeM(P, 1.2)}/>`, ros, `<circle cx="38" cy="38" r="6" fill="${P.m}"/>`].join('');
  },
  divider(P) {
    return both(150, `<path d="${wave(20, 118, 13, 4, 26, 0)}" ${strokeM(P, 1.3)}/><path d="${wave(20, 118, 13, 4, 26, Math.PI)}" fill="none" stroke="${P.s}" stroke-width="1.3"/>`) + `<path d="M150 3L158 13L150 23L142 13Z" fill="${P.m}" stroke="${P.s}" stroke-width="1"/>`;
  },
};

// ---------- 8. kids: rainbow beads ----------
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#8b5cf6'] as const;
const rainbow = (i: number): string => RAINBOW[i % RAINBOW.length] ?? '#ef4444';
/** Evenly spaced points around a pill (a rectangle with half-circle ends). */
const stadiumPoints = (x: number, y: number, w: number, h: number, step: number): Pt[] => {
  const r = h / 2;
  const straight = w - 2 * r;
  const len = 2 * straight + 2 * Math.PI * r;
  const count = Math.round(len / step);
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let d = (i / count) * len;
    if (d < straight) {
      pts.push([x + r + d, y]);
    } else if ((d -= straight) < Math.PI * r) {
      const a = -Math.PI / 2 + d / r;
      pts.push([x + w - r + r * Math.cos(a), y + r + r * Math.sin(a)]);
    } else if ((d -= Math.PI * r) < straight) {
      pts.push([x + w - r - d, y + h]);
    } else {
      d -= straight;
      const a = Math.PI / 2 + d / r;
      pts.push([x + r + r * Math.cos(a), y + r + r * Math.sin(a)]);
    }
  }
  return pts;
};
const kids: Art = {
  id: 'kids', title: '#d9480f', text: '#2b2b6e', nameColor: '#2b2b6e', nameBox: { cy: 60, w: 180 },
  colors: colors('#2b2b6e'),
  paints: [['m', [[0, '#ef4444'], [0.2, '#f97316'], [0.4, '#facc15'], [0.6, '#22c55e'], [0.8, '#38bdf8'], [1, '#8b5cf6']], true]],
  plate() {
    const ring = stadiumPoints(50, 32, 220, 56, 15).map(([x, y], i) => `<circle cx="${n(x)}" cy="${n(y)}" r="8.5" fill="${rainbow(i)}"/>`).join('');
    return [
      ring, `<rect x="56" y="38" width="208" height="44" rx="22" fill="#fff"/>`,
      `<path d="${star(34, 22, 13, 5.6)}" fill="#facc15" stroke="#f59e0b" stroke-width="1"/><path d="${star(292, 100, 11, 4.6)}" fill="#facc15" stroke="#f59e0b" stroke-width="1"/><path d="${star(286, 20, 7, 3)}" fill="#38bdf8"/><path d="${star(30, 100, 7, 3)}" fill="#ef4444"/>`,
      `<circle cx="14" cy="60" r="4" fill="#22c55e"/><circle cx="306" cy="60" r="4" fill="#8b5cf6"/><circle cx="104" cy="12" r="3" fill="#f97316"/><circle cx="216" cy="110" r="3" fill="#f97316"/><circle cx="226" cy="12" r="3" fill="#ef4444"/><circle cx="96" cy="110" r="3" fill="#22c55e"/>`,
    ].join('');
  },
  corner() {
    return [`<path d="${star(34, 34, 24, 10)}" fill="#facc15" stroke="#f59e0b" stroke-width="1.4"/>`, `<circle cx="78" cy="30" r="7" fill="#ef4444"/><circle cx="96" cy="44" r="5" fill="#38bdf8"/><circle cx="30" cy="78" r="7" fill="#22c55e"/><circle cx="44" cy="96" r="5" fill="#8b5cf6"/><circle cx="64" cy="64" r="4" fill="#f97316"/>`, `<path d="${star(112, 24, 6, 2.6)}" fill="#8b5cf6"/><path d="${star(24, 112, 6, 2.6)}" fill="#ef4444"/>`].join('');
  },
  divider() {
    return both(150, RAINBOW.map((c, i) => `<circle cx="${130 - i * 18}" cy="13" r="${n(5 - i * 0.3)}" fill="${c}"/>`).join('')) + `<path d="${star(150, 13, 11, 4.6)}" fill="#facc15" stroke="#f59e0b" stroke-width="1"/>`;
  },
};

// ---------- 9. simple line (cheap on ink, prints well on any printer) ----------
const INK = '#1c1c1c';
const mono: Art = {
  id: 'mono', title: '#111111', text: '#111111', nameColor: '#111111', nameBox: { cy: 60, w: 180 },
  colors: colors(INK),
  paints: [['m', [[0, INK], [1, INK]]]],
  plate() {
    const cut = (i: number): string => {
      const x0 = 56 + i;
      const x1 = 264 - i;
      const y0 = 34 + i;
      const y1 = 86 - i;
      const c = 10 - i;
      return `M${x0 + c} ${y0}H${x1 - c}L${x1} ${y0 + c}V${y1 - c}L${x1 - c} ${y1}H${x0 + c}L${x0} ${y1 - c}V${y0 + c}Z`;
    };
    return [
      `<path d="${cut(0)}" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="${cut(5)}" fill="none" stroke="${INK}" stroke-width=".7"/>`,
      both(160, `<path d="M22 60H44" stroke="${INK}" stroke-width="1"/><path d="M44 60L50 54L56 60L50 66Z" fill="${INK}"/>`),
      `<path d="M138 34L160 22L182 34" fill="none" stroke="${INK}" stroke-width="1.2"/><path d="M138 86L160 98L182 86" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="160" cy="16" r="2.4" fill="${INK}"/><circle cx="160" cy="104" r="2.4" fill="${INK}"/>`,
    ].join('');
  },
  corner() {
    return `<path d="M0 0H64M0 0V64" stroke="${INK}" stroke-width="2.2" fill="none"/><path d="M12 12H44M12 12V44" stroke="${INK}" stroke-width=".8" fill="none"/><rect x="10" y="10" width="6" height="6" fill="${INK}"/>`;
  },
  divider() {
    return both(150, `<path d="M20 13H126" stroke="${INK}" stroke-width="1"/>`) + `<path d="M150 5L158 13L150 21L142 13Z" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="150" cy="13" r="1.8" fill="${INK}"/>`;
  },
};

// ---------- 10. rising sun (orange and gold) ----------
const rays = (P: Ctx, cx: number, cy: number, r0: number, rLong: number, rShort: number, from: number, to: number, step: number, sw = 2.6): string => {
  let s = '';
  let i = 0;
  for (let a = from; a <= to + 0.01; a += step, i++) {
    const rad = (a * Math.PI) / 180;
    const r1 = i % 2 === 0 ? rLong : rShort;
    s += `<path d="M${n(cx + r0 * Math.cos(rad))} ${n(cy + r0 * Math.sin(rad))}L${n(cx + r1 * Math.cos(rad))} ${n(cy + r1 * Math.sin(rad))}" stroke="${P.m}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  return s;
};
const sun: Art = {
  id: 'sun', title: '#b4510a', text: '#6b2d04', nameColor: '#6b2d04', nameBox: { cy: 67, w: 180 },
  colors: colors('#a24708'),
  paints: [['m', [[0, '#ffd84d'], [0.5, '#f59a1b'], [1, '#d6620b']]]],
  plate(P) {
    return [
      rays(P, 160, 44, 22, 41, 31, 180, 360, 12.857), `<path d="M144 44A16 16 0 0 1 176 44Z" fill="${P.m}" stroke="${P.c.line}" stroke-width=".8"/>`,
      `<rect x="56" y="44" width="208" height="46" rx="23" fill="#fffaf0" stroke="${P.m}" stroke-width="3.4"/><rect x="61" y="49" width="198" height="36" rx="18" fill="none" stroke="${P.c.line}" stroke-width=".8"/>`,
      both(160, rays(P, 46, 67, 8, 26, 18, 120, 240, 20, 2.2)),
      `<path d="M120 100Q160 112 200 100" fill="none" stroke="${P.m}" stroke-width="2.4" stroke-linecap="round"/><path d="M138 108Q160 115 182 108" fill="none" stroke="${P.m}" stroke-width="1.8" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    return [rays(P, 18, 18, 18, 66, 46, 0, 90, 10, 3), `<path d="M0 18A18 18 0 0 1 18 0V18Z" fill="${P.m}"/>`, `<path d="M18 52A34 34 0 0 0 52 18" fill="none" stroke="${P.c.line}" stroke-width=".9"/>`].join('');
  },
  divider(P) {
    return `<path d="M130 22A20 20 0 0 1 170 22Z" fill="${P.m}"/>${rays(P, 150, 22, 24, 34, 29, 180, 360, 15, 1.8)}${both(150, `<path d="M20 20H108" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/>`)}`;
  },
};

// ======================================================================================================================================================
// Styles 11 to 20 (added 2026-11-06). The same rules for all ten, kept by tests and by the real-shell check of every style:
//  * the frame around a name: an outer line and an inner line round a plain white inside. The ink of a Khmer name reaches 0.6 em above and below the middle of its line
//    (0.9 em for names with stacked marks), which is 14 and 21 units on this 320 x 120 plate; so nothing is drawn within 24 units of the middle of the name
//    (the inner line is 25 units from it, the outer 31), and the name box is 176 units wide (a long name shrinks to fit it, so it never reaches the ends of the frame);
//  * the ink of a plate stays between x 4 and x 316, and at least 9.6 units are free above and below it together (the rows of frames overlap by that much);
//  * a page corner is a flat cap: at most 64 units along the top or bottom edge and 32 inward (a thin line along an edge may run a little longer), so that even a long
//    name in the signature lines can never reach it (the signatures end 53 px above the foot of the page, the cap begins 47 px above it, 12 of which is the margin);
//  * the page border sits 12 px from the edge and its inner rule at most 17 px, so that it is clear of the text, which starts 19 px from the edge;
//  * the two light-ink styles (vintage, modern) use thin dark lines only (modern adds a few small squares), no pale colour anywhere, as readable in grey as in colour.
// The real-shell test lays the real printed text over the real artwork, pixel by pixel, in all twenty styles and in the worst case.
// ======================================================================================================================================================

/** The path of a crescent moon of radius R (the part of the circle that is left when a circle `d` further to the right is taken away), centred on the origin. */
const crescentPath = (R: number): string => {
  const d = 0.36 * R;
  const r2 = 0.94 * R;
  const x = (d * d + R * R - r2 * r2) / (2 * d);
  const y = Math.sqrt(Math.max(0, R * R - x * x));
  return `M${n(x)} ${n(-y)}A${n(R)} ${n(R)} 0 1 0 ${n(x)} ${n(y)}A${n(r2)} ${n(r2)} 0 1 1 ${n(x)} ${n(-y)}Z`;
};

/** One rice ear along a curve: a thin stem with a pair of grains at every step and one at the tip. */
const riceEar = (P: Ctx, path: Bez, pairs: number, grain = 1): string => {
  let s = `<path d="${bezPath(path)}" fill="none" stroke="${P.g}" stroke-width="1.5" stroke-linecap="round"/>`;
  for (let i = 0; i < pairs; i++) {
    const b = bez(path, 0.3 + (i * 0.68) / pairs);
    for (const side of [-1, 1]) {
      s += `<ellipse transform="${at(b.x, b.y, b.deg + 90 + side * 38)}" cx="0" cy="${n(-4.6 * grain)}" rx="${n(2.5 * grain)}" ry="${n(5 * grain)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".5"/>`;
    }
  }
  const tip = bez(path, 1);
  return `${s}<ellipse transform="${at(tip.x, tip.y, tip.deg + 90)}" cx="0" cy="${n(-4.6 * grain)}" rx="${n(2.5 * grain)}" ry="${n(5 * grain)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".5"/>`;
};

/** A fan of narrow fronds (a sugar palm's crown) growing from (x, y), the middle frond pointing where `rot` says (0 = up). */
const palmFan = (P: Ctx, x: number, y: number, rot: number, len: number, fronds = 7, spread = 150): string => {
  let s = '';
  for (let i = 0; i < fronds; i++) {
    const a = fronds === 1 ? 0 : -spread / 2 + (i * spread) / (fronds - 1);
    s += leafAt(x, y, len * (1 - Math.abs(a) / 330), len * 0.12, rot + a, P.g, P.c.line, 0.5);
  }
  return s;
};

/** A rose seen from above: six petals round a bud with a little spiral. */
const roseAt = (P: Ctx, cx: number, cy: number, r: number): string => {
  const petals = Array.from({ length: 6 }, (_, k) => `<ellipse transform="${at(cx, cy, k * 60)}" cx="0" cy="${n(-r * 0.55)}" rx="${n(r * 0.5)}" ry="${n(r * 0.55)}" fill="${P.p}" stroke="${P.c.line}" stroke-width=".7"/>`).join('');
  return `${petals}<circle cx="${cx}" cy="${cy}" r="${n(r * 0.55)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".7"/><path d="${spiral(cx, cy, r * 0.42, 1.5, 1, 0, 0.8)}" fill="none" stroke="${P.c.line}" stroke-width=".9" stroke-linecap="round"/>`;
};

/** A pencil lying along the x axis: its tip points to +x and ends at x + length. */
const pencilAt = (x: number, y: number, length: number, rot: number, P: Ctx): string => {
  const body = length - 10;
  return `<g transform="${at(x, y, rot)}"><rect x="0" y="-4" width="5" height="8" rx="1.6" fill="#f08aa0" stroke="${P.c.line}" stroke-width=".6"/><rect x="5" y="-4" width="3.6" height="8" fill="#c9ced8" stroke="${P.c.line}" stroke-width=".6"/>`
    + `<rect x="8.6" y="-4" width="${n(body - 8.6 + 5)}" height="8" fill="${P.r}" stroke="${P.c.line}" stroke-width=".6"/><path d="M${n(body + 5)} -4L${length} 0L${n(body + 5)} 4Z" fill="#f1d9b0" stroke="${P.c.line}" stroke-width=".6"/><path d="M${n(length - 3.4)} -1.4L${length} 0L${n(length - 3.4)} 1.4Z" fill="${P.c.line}"/></g>`;
};

/** An open book, 2 x w wide and h high, its spine at x. */
const openBook = (P: Ctx, x: number, y: number, w: number, h: number): string => {
  const left = `M${x} ${y + h * 0.18}C${n(x - w * 0.3)} ${n(y - h * 0.1)} ${n(x - w * 0.75)} ${n(y - h * 0.05)} ${n(x - w)} ${n(y + h * 0.1)}V${n(y + h * 0.9)}C${n(x - w * 0.75)} ${n(y + h * 0.75)} ${n(x - w * 0.3)} ${n(y + h * 0.8)} ${x} ${n(y + h)}Z`;
  const right = `M${x} ${y + h * 0.18}C${n(x + w * 0.3)} ${n(y - h * 0.1)} ${n(x + w * 0.75)} ${n(y - h * 0.05)} ${n(x + w)} ${n(y + h * 0.1)}V${n(y + h * 0.9)}C${n(x + w * 0.75)} ${n(y + h * 0.75)} ${n(x + w * 0.3)} ${n(y + h * 0.8)} ${x} ${n(y + h)}Z`;
  const ruled = [0.34, 0.52, 0.7].map((f) => `<path d="M${n(x - w * 0.86)} ${n(y + h * f)}H${n(x - w * 0.16)}M${n(x + w * 0.16)} ${n(y + h * f)}H${n(x + w * 0.86)}" stroke="${P.c.line}" stroke-width=".5" opacity=".75"/>`).join('');
  return `<path d="${left}${right}" fill="#fff" stroke="${P.m}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x} ${n(y + h * 0.18)}V${n(y + h)}" stroke="${P.m}" stroke-width="1.2"/>${ruled}`;
};

/** The frame of the ten newer styles: the outer line (y 29 to 91 round a name at 60) and the inner line (y 35 to 85), the inside plain white. `dy` moves both (the book style). */
const NEW_FRAME_W = 176;
const frameRects = (outerStroke: string, outerW: number, innerStroke: string, innerW: number, rxOuter: number, rxInner: number, dy = 0, innerOpacity = 1): string =>
  `<rect x="51" y="${29 + dy}" width="218" height="62" rx="${rxOuter}" fill="#fff" stroke="${outerStroke}" stroke-width="${outerW}"/>`
  + `<rect x="57" y="${35 + dy}" width="206" height="50" rx="${rxInner}" fill="none" stroke="${innerStroke}" stroke-width="${innerW}"${innerOpacity < 1 ? ` opacity="${innerOpacity}"` : ''}/>`;
/** The page border of the newer styles with a double rule: 12 px from the edge, the inner rule at 17 px (the text starts at 19 px). */
const NEW_PAGE: PageFrame = { inset: 12, outer: 2.2, inner: 0.8, gap: 5 };
const CAP_LINES = (stroke: string, sw: number): string => `<path d="M0 0H64M0 0V32" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

// ---------- 11. kbach: emerald and gold, a frieze of small flames (stylised; not an authentic Khmer ornament) ----------
const kbach: Art = {
  id: 'kbach', title: '#0b5a3d', text: '#12372a', nameColor: '#12372a', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#0b4a33'),
  page: NEW_PAGE,
  paints: [['m', GOLD], ['g', [[0, '#5fc08f'], [0.5, '#0f7a53'], [1, '#07452f']]]],
  plate(P) {
    const D = P.c.line;
    const frieze = (y: number, rot: number): string => [80, 97.5, 115, 132.5].map((x, i) => flame(x, y, rot, i % 2 ? 0.26 : 0.36, i % 2 ? P.g : P.m, D)).join('');
    const tail = flame(47, 60, -90, 0.6, P.m, D) + flame(48, 49, -62, 0.4, P.g, D) + flame(48, 71, -118, 0.4, P.g, D) + `<circle cx="14" cy="60" r="2.6" fill="${P.g}"/>`;
    return [both(160, tail + frieze(29, 0) + frieze(91, 180)), frameRects(P.g, 3.2, P.m, 1.4, 6, 3), flame(160, 29, 0, 0.58, P.m, D), flame(160, 91, 180, 0.58, P.m, D)].join('');
  },
  corner(P) {
    const D = P.c.line;
    return [
      CAP_LINES(P.g, 2.6), `<path d="M7 7H34M7 7V24" fill="none" stroke="${P.m}" stroke-width="1.2" stroke-linecap="round"/>`,
      flame(16, 16, 135, 0.55, P.m, D), flame(16, 16, 100, 0.4, P.g, D), flame(16, 16, 168, 0.4, P.g, D), flame(44, 2, 180, 0.34, P.m, D), flame(58, 2, 180, 0.26, P.g, D),
      `<circle cx="16" cy="16" r="3.4" fill="${P.g}" stroke="${P.m}" stroke-width=".8"/>`,
    ].join('');
  },
  divider(P) {
    const D = P.c.line;
    return both(150, `<path d="M16 20H112" stroke="${P.g}" stroke-width="1.5" stroke-linecap="round"/>${flame(92, 20, 0, 0.3, P.m, D)}${flame(70, 20, 0, 0.24, P.g, D)}${flame(50, 20, 0, 0.3, P.m, D)}`) + flame(150, 22, 0, 0.5, P.m, D);
  },
};

// ---------- 12. rice ears (gold and green) ----------
const rice: Art = {
  id: 'rice', title: '#8a5a0c', text: '#3b2a0a', nameColor: '#3b2a0a', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#6b4a0c', { leaf: '#3d7a2b' }),
  page: NEW_PAGE,
  paints: [['m', [[0, '#f6d56a'], [0.5, '#d9a21f'], [1, '#a8700f']]], ['g', [[0, '#8cc063'], [1, '#3f7d2a']]]],
  plate(P) {
    const long: Bez = [[150, 103], [100, 112], [32, 110], [17, 58]];
    const short: Bez = [[146, 98], [112, 100], [72, 102], [42, 94]];
    return [
      both(160, riceEar(P, long, 8, 0.9) + riceEar(P, short, 4, 0.7)),
      frameRects(P.m, 3.4, P.g, 1.2, 14, 8),
      `<path d="M140 23Q160 12 180 23" fill="none" stroke="${P.m}" stroke-width="2.2" stroke-linecap="round"/><circle cx="160" cy="12" r="3" fill="${P.m}" stroke="${P.c.line}" stroke-width=".5"/>`,
    ].join('');
  },
  corner(P) {
    return [riceEar(P, [[8, 10], [26, 6], [46, 10], [62, 24]], 5, 0.7), `<circle cx="6" cy="9" r="3.6" fill="${P.m}" stroke="${P.c.line}" stroke-width=".6"/>`].join('');
  },
  divider(P) {
    return both(150, `<path d="M14 22H34" stroke="${P.g}" stroke-width="1.4" stroke-linecap="round"/>${riceEar(P, [[132, 20], [112, 14], [82, 12], [44, 20]], 7, 0.62)}`) + `<ellipse cx="150" cy="13" rx="3" ry="6" fill="${P.m}" stroke="${P.c.line}" stroke-width=".5"/>`;
  },
};

// ---------- 13. sugar palm (green) ----------
const palm: Art = {
  id: 'palm', title: '#1f6b2b', text: '#16361a', nameColor: '#16361a', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#1d4a1a', { leaf: '#1f6b2b' }),
  page: NEW_PAGE,
  paints: [['m', [[0, '#d2ad74'], [1, '#7a5230']]], ['g', [[0, '#a4d36e'], [0.5, '#3f9a3a'], [1, '#1f6528']]]],
  plate(P) {
    const tree = `<path d="M27 108C31 96 25 82 28 68" fill="none" stroke="${P.m}" stroke-width="4" stroke-linecap="round"/>${palmFan(P, 28, 68, 0, 23, 7, 150)}<path d="M10 109H46" stroke="${P.c.line}" stroke-width="1.2" stroke-linecap="round"/>`;
    return [
      both(160, tree), frameRects(P.g, 3.2, P.m, 1.2, 10, 6),
      palmFan(P, 160, 29, 0, 15, 5, 110),
      `<path d="M118 99Q160 109 202 99" fill="none" stroke="${P.g}" stroke-width="2" stroke-linecap="round"/><path d="M136 107Q160 113 184 107" fill="none" stroke="${P.g}" stroke-width="1.5" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    return [CAP_LINES(P.g, 1.6), palmFan(P, 8, 8, 135, 26, 5, 70), palmFan(P, 46, 3, 180, 12, 3, 70), `<circle cx="8" cy="8" r="4.2" fill="${P.m}" stroke="${P.c.line}" stroke-width=".6"/>`].join('');
  },
  divider(P) {
    return both(150, `<path d="M16 22H108" stroke="${P.g}" stroke-width="1.5" stroke-linecap="round"/>${palmFan(P, 98, 22, 20, 9, 3, 70)}`) + `<path d="M150 24V16" stroke="${P.m}" stroke-width="2" stroke-linecap="round"/>${palmFan(P, 150, 16, 0, 12, 5, 130)}`;
  },
};

// ---------- 14. rose (rose red and soft pink) ----------
const rose: Art = {
  id: 'rose', title: '#a3194f', text: '#4a1230', nameColor: '#4a1230', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#8e1f4a', { leaf: '#2f7a3a' }),
  page: NEW_PAGE,
  paints: [['m', [[0, '#ee86b0'], [0.5, '#d9456f'], [1, '#a3194f']]], ['p', [[0, '#ffe1ea'], [0.6, '#f18ba8'], [1, '#d4456f']]], ['g', [[0, '#9ad06a'], [0.5, '#4d9a38'], [1, '#235f23']]]],
  plate(P) {
    const side = `${leafAt(29, 60, 22, 7, -62, P.g, P.c.leaf, 0.6)}${leafAt(29, 60, 22, 7, -118, P.g, P.c.leaf, 0.6)}${leafAt(29, 60, 17, 5.6, -90, P.g, P.c.leaf, 0.6)}${roseAt(P, 29, 60, 14)}`;
    return [
      both(160, side), frameRects(P.m, 3, P.c.line, 0.8, 14, 8, 0, 0.8),
      `${leafAt(160, 27, 15, 5, -52, P.g, P.c.leaf, 0.5)}${leafAt(160, 27, 15, 5, 52, P.g, P.c.leaf, 0.5)}${roseAt(P, 160, 18, 8)}`,
      `<path d="M126 100Q160 111 194 100" fill="none" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/><circle cx="160" cy="109" r="2.6" fill="${P.m}"/>`,
    ].join('');
  },
  corner(P) {
    return [leafAt(15, 15, 38, 6.4, 90, P.g, P.c.leaf, 0.6), leafAt(15, 15, 18, 5, 160, P.g, P.c.leaf, 0.6), roseAt(P, 15, 15, 11)].join('');
  },
  divider(P) {
    return both(150, `<path d="M16 20H112" stroke="${P.m}" stroke-width="1.4" stroke-linecap="round"/>${leafAt(110, 20, 11, 3.8, 70, P.g, P.c.leaf, 0.4)}${leafAt(96, 20, 9, 3.2, 52, P.g, P.c.leaf, 0.4)}`) + `${leafAt(150, 17, 12, 4.2, -62, P.g, P.c.leaf, 0.4)}${leafAt(150, 17, 12, 4.2, 62, P.g, P.c.leaf, 0.4)}${roseAt(P, 150, 12, 8)}`;
  },
};

// ---------- 15. crescent moon and stars (night blue and silver) ----------
const moon: Art = {
  id: 'moon', title: '#2a2f6b', text: '#1a1f4d', nameColor: '#1a1f4d', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#232a6b', { silver: '#8f9bc0' }),
  page: NEW_PAGE,
  paints: [['m', [[0, '#c3cae6'], [0.5, '#8791bd'], [1, '#454f8c']]], ['n', [[0, '#3b4a9a'], [1, '#1c2566']]]],
  plate(P) {
    const sky = `<path d="${star(28, 34, 8, 3.4)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".6"/><path d="${star(36, 92, 5, 2.2)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".5"/><circle cx="16" cy="64" r="2" fill="${P.n}"/><path d="${star(18, 80, 3.6, 1.6)}" fill="${P.n}"/>`;
    return [
      both(160, sky), frameRects(P.n, 3, P.m, 1.4, 12, 7),
      `<path transform="${at(160, 16, -18)}" d="${crescentPath(10)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".8" stroke-linejoin="round"/><path d="${star(173, 13, 4.4, 1.9)}" fill="${P.n}"/><path d="${star(148, 22, 3.2, 1.4)}" fill="${P.n}"/>`,
      `<path d="M126 100Q160 111 194 100" fill="none" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/><path d="${star(160, 108, 4, 1.8)}" fill="${P.n}"/>`,
    ].join('');
  },
  corner(P) {
    return [
      CAP_LINES(P.n, 1.8), `<path transform="${at(14, 15, 45)}" d="${crescentPath(10)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".8" stroke-linejoin="round"/>`,
      `<path d="${star(36, 10, 4, 1.7)}" fill="${P.n}"/><path d="${star(48, 17, 3, 1.3)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".4"/><path d="${star(60, 9, 3.4, 1.5)}" fill="${P.n}"/><path d="${star(10, 29, 3, 1.3)}" fill="${P.n}"/>`,
    ].join('');
  },
  divider(P) {
    return both(150, `<path d="M16 13H116" stroke="${P.n}" stroke-width="1.4" stroke-linecap="round"/><path d="${star(100, 13, 5, 2.1)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".4"/>`) + `<path transform="${at(150, 13, -18)}" d="${crescentPath(9)}" fill="${P.m}" stroke="${P.c.line}" stroke-width=".7" stroke-linejoin="round"/>`;
  },
};

// ---------- 16. book and pencil (blue; "education") ----------
const book: Art = {
  id: 'book', title: '#1d4f91', text: '#14315c', nameColor: '#14315c', nameBox: { cy: 63, w: NEW_FRAME_W },
  colors: colors('#1b4a86'),
  page: NEW_PAGE,
  paints: [['m', [[0, '#5a93dc'], [0.5, '#1f5fa8'], [1, '#133e75']]], ['r', [[0, '#ffe27a'], [1, '#f0b800']]]],
  plate(P) {
    return [
      both(160, pencilAt(8, 63, 38, 0, P)),
      frameRects(P.m, 2.6, P.m, 0.9, 9, 5, 3),
      openBook(P, 160, 6, 36, 23),
      `<path d="M120 102H200" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/><path d="M138 110H182" stroke="${P.m}" stroke-width="1.2" stroke-linecap="round"/>`,
    ].join('');
  },
  corner(P) {
    return [CAP_LINES(P.m, 2.2), `<path d="M7 7H36M7 7V24" fill="none" stroke="${P.m}" stroke-width=".9" stroke-linecap="round"/>`, openBook(P, 17, 9, 10, 15), pencilAt(32, 11, 32, 0, P)].join('');
  },
  divider(P) {
    return both(150, `<path d="M16 13H110" stroke="${P.m}" stroke-width="1.3" stroke-linecap="round"/>`) + openBook(P, 150, 3, 22, 18);
  },
};

// ---------- 17. national colours (blue, red, blue stripes that touch, the red in the middle, as on the flag: no white between them; plain corners) ----------
const flag: Art = {
  id: 'flag', title: '#0b2a8a', text: '#10215e', nameColor: '#10215e', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#0b2a8a'),
  paints: [['m', [[0, '#1b3fa8'], [1, '#0e2a80']]], ['r', [[0, '#e0182f'], [1, '#b00020']]]],
  page: { inset: 10, outer: 2, inner: 4, gap: 3, paint: 'r', third: 2 },   // three rules against each other: blue, red (the middle), blue; the inner edge is at 17 px, clear of the text
  plate(P) {
    // every group of stripes is blue : red : blue with the red in the middle, and the stripes touch (no white between them):
    //  - the stripes at the two ends run into the frame; - the frame is three bands: blue outside (2), red (4), blue inside (2), the white only inside; - above and below it a
    //  red stripe sits between a blue stripe and the blue of the frame. The innermost edge of the frame is 24 units from the middle of the name.
    const bands = `<rect x="6" y="46" width="46" height="7" fill="${P.m}"/><rect x="6" y="53" width="46" height="14" fill="${P.r}"/><rect x="6" y="67" width="46" height="7" fill="${P.m}"/>`;
    const frame = `<rect x="51" y="28.9" width="218" height="62.2" fill="#fff" stroke="${P.m}" stroke-width="2"/><rect x="54" y="31.9" width="212" height="56.2" fill="none" stroke="${P.r}" stroke-width="4"/><rect x="57" y="34.9" width="206" height="50.2" fill="none" stroke="${P.m}" stroke-width="2"/>`;
    const caps = `<rect x="120" y="19.9" width="80" height="2" fill="${P.m}"/><rect x="120" y="21.9" width="80" height="6" fill="${P.r}"/><rect x="120" y="92.1" width="80" height="6" fill="${P.r}"/><rect x="120" y="98.1" width="80" height="2" fill="${P.m}"/>`;
    return [both(160, bands), frame, caps].join('');
  },
  corner() {
    return '';   // plain corners: the three rules of the border are the ornament
  },
  divider(P) {
    return both(150, `<rect x="16" y="8.5" width="134" height="2.5" fill="${P.m}"/><rect x="16" y="11" width="134" height="5" fill="${P.r}"/><rect x="16" y="16" width="134" height="2.5" fill="${P.m}"/>`) + `<path d="M150 4L158 13L150 22L142 13Z" fill="${P.r}"/>`;
  },
};

// ---------- 18. old paper (sepia thin lines, no solid areas: light on ink) ----------
const VINTAGE = '#6b4f2a';
const vintage: Art = {
  id: 'vintage', title: '#5a4023', text: '#2b2218', nameColor: '#2b2218', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors(VINTAGE),
  paints: [['m', [[0, VINTAGE], [1, VINTAGE]]]],
  page: { inset: 12, outer: 1.4, inner: 0.8, gap: 4 },
  plate() {
    const notched = (x0: number, y0: number, x1: number, y1: number, c: number): string =>
      `M${x0 + c} ${y0}H${x1 - c}A${c} ${c} 0 0 0 ${x1} ${y0 + c}V${y1 - c}A${c} ${c} 0 0 0 ${x1 - c} ${y1}H${x0 + c}A${c} ${c} 0 0 0 ${x0} ${y1 - c}V${y0 + c}A${c} ${c} 0 0 0 ${x0 + c} ${y0}Z`;
    const end = `<path d="M22 60H40" stroke="${VINTAGE}" stroke-width="1"/><path d="M41 60L46 55L51 60L46 65Z" fill="none" stroke="${VINTAGE}" stroke-width="1"/><circle cx="16" cy="60" r="2.4" fill="none" stroke="${VINTAGE}" stroke-width="1"/>`;
    return [
      `<path d="${notched(51, 29, 269, 91, 11)}" fill="#fff" stroke="${VINTAGE}" stroke-width="1.6"/><path d="${notched(57, 35, 263, 85, 5)}" fill="none" stroke="${VINTAGE}" stroke-width=".8"/>`,
      both(160, end),
      `<path d="M132 29C140 17 152 17 160 25C168 17 180 17 188 29" fill="none" stroke="${VINTAGE}" stroke-width="1.1" stroke-linecap="round"/><circle cx="160" cy="10" r="2.6" fill="none" stroke="${VINTAGE}" stroke-width="1"/>`,
      `<path d="M132 91C140 103 152 103 160 95C168 103 180 103 188 91" fill="none" stroke="${VINTAGE}" stroke-width="1.1" stroke-linecap="round"/><circle cx="160" cy="110" r="2.6" fill="none" stroke="${VINTAGE}" stroke-width="1"/>`,
    ].join('');
  },
  corner() {
    return `<path d="M0 0H64M0 0V32" fill="none" stroke="${VINTAGE}" stroke-width="1.4"/><path d="M8 8H44M8 8V26" fill="none" stroke="${VINTAGE}" stroke-width=".8"/><circle cx="8" cy="8" r="3.4" fill="none" stroke="${VINTAGE}" stroke-width="1"/><path d="M50 8L55 3L60 8L55 13Z" fill="none" stroke="${VINTAGE}" stroke-width=".9"/><path d="M8 20A12 12 0 0 0 20 8" fill="none" stroke="${VINTAGE}" stroke-width=".8"/>`;
  },
  divider() {
    return both(150, `<path d="M20 13H124" stroke="${VINTAGE}" stroke-width="1"/><circle cx="116" cy="13" r="2" fill="none" stroke="${VINTAGE}" stroke-width=".9"/>`) + `<path d="M150 5L158 13L150 21L142 13Z" fill="none" stroke="${VINTAGE}" stroke-width="1.1"/><circle cx="150" cy="13" r="1.6" fill="none" stroke="${VINTAGE}" stroke-width=".9"/>`;
  },
};

// ---------- 19. modern geometric (one colour, thin lines: light on ink) ----------
const MODERN = '#34408f';
const modern: Art = {
  id: 'modern', title: '#2b3680', text: '#1a1f45', nameColor: '#1a1f45', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors(MODERN),
  paints: [['m', [[0, MODERN], [1, MODERN]]]],
  page: { inset: 12, outer: 1.2, inner: 0, gap: 0 },
  plate() {
    const chamfer = (x0: number, y0: number, x1: number, y1: number, c: number): string => `M${x0 + c} ${y0}H${x1}V${y1 - c}L${x1 - c} ${y1}H${x0}V${y0 + c}Z`;
    return [
      `<path d="${chamfer(51, 29, 269, 91, 16)}" fill="#fff" stroke="${MODERN}" stroke-width="1.6" stroke-linejoin="miter"/><path d="${chamfer(57, 35, 263, 85, 10)}" fill="none" stroke="${MODERN}" stroke-width=".8"/>`,
      both(160, `<path d="M14 54H46M14 66H46" stroke="${MODERN}" stroke-width="1.2"/><rect x="6" y="57" width="6" height="6" fill="${MODERN}"/>`),
      `<path d="M130 20H190M148 12H172" stroke="${MODERN}" stroke-width="1.2"/><path d="M130 100H190M148 108H172" stroke="${MODERN}" stroke-width="1.2"/>`,
    ].join('');
  },
  corner() {
    return `<path d="M0 0H60M0 0V30" fill="none" stroke="${MODERN}" stroke-width="1.6"/><path d="M10 10H34M10 10V22" fill="none" stroke="${MODERN}" stroke-width=".8"/><rect x="0" y="0" width="7" height="7" fill="${MODERN}"/><path d="M44 0L52 8" stroke="${MODERN}" stroke-width=".8"/><path d="M0 22L8 30" stroke="${MODERN}" stroke-width=".8"/>`;
  },
  divider() {
    return both(150, `<path d="M20 13H126M44 8H110" stroke="${MODERN}" stroke-width="1"/>`) + `<path d="M150 5L158 13L150 21L142 13Z" fill="none" stroke="${MODERN}" stroke-width="1.2"/><rect x="147.6" y="10.6" width="4.8" height="4.8" fill="${MODERN}"/>`;
  },
};

// ---------- 20. sea waves (teal) ----------
const waves = (x: number, y: number, w: number, amp: number, period: number, sw: number, paint: string): string => {
  let d = `M${x} ${y}`;
  for (let i = 0; i < Math.round(w / period); i++) d += `q${n(period / 4)} ${n(-amp)} ${n(period / 2)} 0t${n(period / 2)} 0`;
  return `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${sw}" stroke-linecap="round"/>`;
};
const wave20: Art = {
  id: 'wave', title: '#0b6670', text: '#0c3a40', nameColor: '#0c3a40', nameBox: { cy: 60, w: NEW_FRAME_W },
  colors: colors('#0a5f69'),
  page: NEW_PAGE,
  paints: [['m', [[0, '#48b9c1'], [0.5, '#12909b'], [1, '#0a5f69']]], ['s', [[0, '#e5fafb'], [1, '#8fd9de']]]],
  plate(P) {
    const curl = `<path d="${spiral(30, 60, 13, 1.7, 1, 0, 0.84)}" fill="none" stroke="${P.m}" stroke-width="2.2" stroke-linecap="round"/><path d="M12 76Q24 84 38 76" fill="none" stroke="${P.m}" stroke-width="1.6" stroke-linecap="round"/>`;
    return [
      both(160, curl), frameRects(P.m, 3, P.c.line, 0.8, 14, 8, 0, 0.8),
      waves(96, 100, 128, 7, 32, 2, P.m), waves(114, 109, 92, 5, 23, 1.6, P.m), waves(112, 22, 96, 6, 24, 1.8, P.m), waves(130, 12, 60, 4, 20, 1.4, P.m),
      `<circle cx="84" cy="106" r="2" fill="none" stroke="${P.m}" stroke-width="1"/><circle cx="238" cy="106" r="2" fill="none" stroke="${P.m}" stroke-width="1"/>`,
    ].join('');
  },
  corner(P) {
    return [`<path d="M0 0H64M0 0V32" fill="none" stroke="${P.m}" stroke-width=".9" opacity=".7"/>`, `<path d="${spiral(15, 15, 11, 1.7, 1, 0, 0.84)}" fill="none" stroke="${P.m}" stroke-width="2" stroke-linecap="round"/>`, waves(36, 10, 28, 3, 14, 1.6, P.m)].join('');
  },
  divider(P) {
    return both(150, waves(16, 13, 100, 4, 25, 1.5, P.m)) + `<circle cx="150" cy="13" r="4.4" fill="none" stroke="${P.m}" stroke-width="1.6"/><circle cx="150" cy="13" r="1.6" fill="${P.m}"/>`;
  },
};

const ARTS: Record<HonorStyleId, Art> = {
  classic, lotus, angkor, star: starRibbon, royal, laurel, guilloche, kids, mono, sun,
  kbach, rice, palm, rose, moon, book, flag, vintage, modern, wave: wave20,
};

/** The colours and name position of a style (an unknown id gives the classic gold look). */
export function honorLook(id: string): HonorLook {
  const art = isHonorStyleId(id) ? ARTS[id] : classic;
  return { title: art.title, text: art.text, nameColor: art.nameColor, nameBox: art.nameBox };
}

const artOf = (id: string): Art => (isHonorStyleId(id) ? ARTS[id] : classic);
const wrap = (viewBox: string, inner: string, context: Ctx): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${context.defs}${inner}</svg>`;

/** The frame around one name. Scales to its box (320 : 120). */
export function plateSvg(id: string): string {
  const art = artOf(id);
  const P = context(art, 'plate', 320);
  return wrap('0 0 320 120', art.plate(P), P);
}

/** The flourish under the national header (300 : 26). */
export function dividerSvg(id: string): string {
  const art = artOf(id);
  const P = context(art, 'div', 300);
  return wrap('0 0 300 26', art.divider(P), P);
}

/** The page border and its four corners, for a page `w` x `h` (CSS pixels). The border sits 16 px inside the box (14 for the simple line style). */
export function pageSvg(id: string, w: number, h: number): string {
  const art = artOf(id);
  const P = context(art, 'page', w);
  const inset = art.page?.inset ?? (art.id === 'mono' ? 14 : 16);
  const corner = art.corner(P);
  const corners = `<g transform="translate(${inset} ${inset})">${corner}</g><g transform="translate(${w - inset} ${inset}) scale(-1 1)">${corner}</g><g transform="translate(${inset} ${h - inset}) scale(1 -1)">${corner}</g><g transform="translate(${w - inset} ${h - inset}) scale(-1 -1)">${corner}</g>`;
  const frame = art.page;
  const line = frame
    ? `<rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="${P.m}" stroke-width="${frame.outer}"/>`
      + (frame.inner > 0 ? `<rect x="${inset + frame.gap}" y="${inset + frame.gap}" width="${w - 2 * inset - 2 * frame.gap}" height="${h - 2 * inset - 2 * frame.gap}" fill="none" stroke="${P[frame.paint ?? 'm']}" stroke-width="${frame.inner}"/>` : '')
      + (frame.third ? `<rect x="${inset + 2 * frame.gap}" y="${inset + 2 * frame.gap}" width="${w - 2 * inset - 4 * frame.gap}" height="${h - 2 * inset - 4 * frame.gap}" fill="none" stroke="${P.m}" stroke-width="${frame.third}"/>` : '')
    : art.id === 'kids'
    ? `<rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" rx="14" fill="none" stroke="${P.m}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 15"/>`
    : `<rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="${P.m}" stroke-width="${art.id === 'mono' ? 1.4 : 2.2}"/><rect x="${inset + 6}" y="${inset + 6}" width="${w - 2 * inset - 12}" height="${h - 2 * inset - 12}" fill="none" stroke="${P.m}" stroke-width=".8"/>`;
  return wrap(`0 0 ${w} ${h}`, line + corners, P);
}

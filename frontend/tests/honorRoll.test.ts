// The roll of honour (តារាងកិត្តិយស): who is on it, how the names are laid out, what the print address carries, and that every artwork style is well formed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StudentResult } from '../app/types/api';
import { DEFAULT_HONOR_STYLE, HONOR_STYLE_IDS, dividerSvg, honorLook, isHonorStyleId, pageSvg, plateSvg } from '../app/utils/honorArt';
import {
  HONOR_TEXT_KEYS, HONOR_TEXT_MAX, NATIONAL_HEADER_FALLBACK, STANDARD_HONOR_DEFAULTS, STANDARD_HONOR_FORMATS, STANDARD_HONOR_TEXTS, cleanHonorText, expandHonorText, honorDefaultsFrom, honorFormatStyle, honorFormatsJson, honorLayout,
  honorPrintPath, honorRows, honorSettingsOf, honorTextProblem, honorTextsProblem, honorTokenValues, parseHonorFormats, parseHonorQuery, selectHonorRoll,
  type HonorOptions,
} from '../app/utils/honorRoll';

const SETTINGS_JAVA = path.resolve(__dirname, '..', '..', 'backend', 'src', 'main', 'java', 'kh', 'school', 'sms', 'settings', 'AppSettingsService.java');

let nextId = 1;
/** A student's result as the backend sends it: `rank` is null while the result is incomplete. */
function student(nameKm: string, rank: number | null, complete = rank !== null): StudentResult {
  const id = nextId++;
  return {
    enrollmentId: id, studentId: id, studentCode: `2026-${String(id).padStart(4, '0')}`, nameKm, scores: [], total: 0, totalMax: 0,
    percent: complete ? 80 : null, bandLetter: null, bandLabel: null, passed: null, rank, complete, absentCount: 0, subScores: [],
  };
}
const ranked = (...ranks: number[]): StudentResult[] => ranks.map((r, i) => student(`សិស្ស${i + 1}`, r));

describe('selectHonorRoll', () => {
  it('lists the best five, best first, and says how many have a rank', () => {
    const roll = selectHonorRoll(ranked(3, 1, 7, 2, 5, 4, 6, 8), 5);
    expect(roll.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(roll.extra).toBe(0);
    expect(roll.ranked).toBe(8);
    expect(roll.total).toBe(8);
  });

  it('gives ten names when ten are asked for, and five when five are', () => {
    const students = ranked(...Array.from({ length: 14 }, (_, i) => i + 1));
    expect(selectHonorRoll(students, 10).entries).toHaveLength(10);
    expect(selectHonorRoll(students, 5).entries).toHaveLength(5);
  });

  it('never cuts a tie: everyone who shares the last rank is listed, and the page is told by how many names it went over', () => {
    // 1, 2, 3, 4, 5, 5, 5, 8 -> three students share rank 5, so there are seven names for a top five
    const roll = selectHonorRoll(ranked(1, 2, 3, 4, 5, 5, 5, 8), 5);
    expect(roll.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(roll.extra).toBe(2);
  });

  it('lists a tie in the middle with its shared rank (1, 2, 2, 4, 5), which is five names and no extra', () => {
    const roll = selectHonorRoll(ranked(1, 2, 2, 4, 5, 6), 5);
    expect(roll.entries.map((e) => e.rank)).toEqual([1, 2, 2, 4, 5]);
    expect(roll.extra).toBe(0);
  });

  it('lists students that share a rank in Khmer name order, so the sheet is the same every time', () => {
    const roll = selectHonorRoll([student('ខ', 2), student('ក', 2), student('គ', 1)], 5);
    expect(roll.entries.map((e) => e.nameKm)).toEqual(['គ', 'ក', 'ខ']);
  });

  it('leaves out a student whose result is incomplete, even next to the best ones', () => {
    const roll = selectHonorRoll([student('មួយ', 1), student('ពីរ', null, false), student('បី', 2)], 5);
    expect(roll.entries.map((e) => e.nameKm)).toEqual(['មួយ', 'បី']);
    expect(roll.ranked).toBe(2);
    expect(roll.total).toBe(3);
  });

  it('gives a short list for a short class (no empty frames) and an empty one when nobody is ranked', () => {
    expect(selectHonorRoll(ranked(1, 2, 3), 10).entries).toHaveLength(3);
    expect(selectHonorRoll([student('ក', null, false)], 5).entries).toEqual([]);
    expect(selectHonorRoll([], 5).entries).toEqual([]);
  });
});

describe('the layout rows', () => {
  it('is 1,2,2 for five names and 1,2,2,2,2,1 for ten, as printed', () => {
    expect(honorRows(5)).toEqual([1, 2, 2]);
    expect(honorRows(10)).toEqual([1, 2, 2, 2, 2, 1]);
  });

  it('puts the first alone, then pairs, and a last one alone when the rest is odd; every name is in exactly one row', () => {
    expect(honorRows(0)).toEqual([]);
    expect(honorRows(1)).toEqual([1]);
    expect(honorRows(2)).toEqual([1, 1]);
    expect(honorRows(3)).toEqual([1, 2]);
    expect(honorRows(6)).toEqual([1, 2, 2, 1]);
    for (let n = 0; n <= 14; n++) expect(honorRows(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('cuts the names into those rows in rank order', () => {
    expect(honorLayout(['a', 'b', 'c', 'd', 'e'])).toEqual([['a'], ['b', 'c'], ['d', 'e']]);
    expect(honorLayout([])).toEqual([]);
  });
});

const OPTIONS: HonorOptions = {
  count: 10, style: 'laurel', date: '2026-10-31',
  formats: parseHonorFormats('{"dateLines":{"size":"S","bold":true,"align":"right"},"subtitle":{"font":"text"}}'),
  header: 'កម្រងសាលាលេខ២\n{school}\n{class}', subtitle: 'លទ្ធផលប្រចាំខែ{month}', dateLines: 'ថ្ងៃសុក្រ ២រោច\nបាណន់ ត្រូវនឹង{date}', titleRight: 'គ្រូបន្ទុកថ្នាក់', titleLeft: 'បានឃើញ និងឯកភាព\nនាយកសាលា',
};
const queryOf = (path: string): Record<string, string> => Object.fromEntries(new URLSearchParams(path.split('?')[1]));

describe('the print address', () => {
  it('carries one class, or every class of the year, the choices and the five texts, and reads back the same', () => {
    const one = honorPrintPath(7, 3, OPTIONS);
    expect(one).toContain('examinationId=7');
    expect(one).toContain('classId=3');
    expect(one).not.toContain('all=');
    const all = honorPrintPath(7, null, OPTIONS);
    expect(all).toContain('all=1');
    expect(all).not.toContain('classId=');

    expect(parseHonorQuery(queryOf(one))).toEqual({ examinationId: 7, classId: 3, all: false, options: OPTIONS });
    expect(parseHonorQuery(queryOf(all)).all).toBe(true);
  });

  it('sends a text box that was emptied as empty, and an address with no text at all means the standard wording', () => {
    const emptied = honorPrintPath(1, 2, { ...OPTIONS, subtitle: '', titleRight: '' });
    expect(emptied).toContain('subtitle=&');
    const back = parseHonorQuery(queryOf(emptied)).options;
    expect(back.subtitle).toBe('');
    expect(back.titleRight).toBe('');
    expect(back.header).toBe(OPTIONS.header);
    const bare = parseHonorQuery({ examinationId: '4' }).options;
    expect(HONOR_TEXT_KEYS.map((k) => bare[k])).toEqual(HONOR_TEXT_KEYS.map((k) => STANDARD_HONOR_TEXTS[k]));
  });

  it('falls back to five names and classic gold for anything unknown or invalid, and cuts over-long text', () => {
    const parsed = parseHonorQuery({ examinationId: '4', count: '99', style: 'not-a-style', date: '31/10/2026', classId: 'abc', header: ['x'.repeat(500)] });
    expect(parsed.classId).toBeNull();
    expect(parsed.options.count).toBe(5);
    expect(parsed.options.style).toBe(DEFAULT_HONOR_STYLE);
    expect(parsed.options.date).toBe('');
    expect(parsed.options.header.length).toBe(HONOR_TEXT_MAX);
  });
});

describe('the artwork', () => {
  const ids = (svg: string): string[] => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  const refs = (svg: string): string[] => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);

  it('has twenty styles, classic gold first (the default), and recognises only those', () => {
    expect(HONOR_STYLE_IDS).toHaveLength(20);
    expect(new Set(HONOR_STYLE_IDS).size).toBe(20);
    expect(HONOR_STYLE_IDS[0]).toBe(DEFAULT_HONOR_STYLE);
    expect(HONOR_STYLE_IDS.every(isHonorStyleId)).toBe(true);
    expect(isHonorStyleId('gold')).toBe(false);
    expect(isHonorStyleId(undefined)).toBe(false);
  });

  it.each([...HONOR_STYLE_IDS])('%s: frame, flourish and page are complete SVG with no broken numbers and every gradient they use defined', (id) => {
    for (const svg of [plateSvg(id), dividerSvg(id), pageSvg(id, 680, 1001)]) {
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg.match(/<g[\s>]/g)?.length ?? 0).toBe(svg.match(/<\/g>/g)?.length ?? 0);
      const defined = new Set(ids(svg));
      expect(defined.size).toBe(ids(svg).length);   // no id twice inside one svg
      for (const ref of refs(svg)) expect(defined.has(ref), `${id}: ${ref} is used but not defined`).toBe(true);
    }
  });

  it('keeps the gradients of the three drawings of one style apart (the page, a frame and the flourish are different svgs of one document)', () => {
    for (const id of HONOR_STYLE_IDS) {
      const all = [...ids(plateSvg(id)), ...ids(dividerSvg(id)), ...ids(pageSvg(id, 680, 1001))];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('draws the same style the same way every time, and a different style differently', () => {
    expect(plateSvg('lotus')).toBe(plateSvg('lotus'));
    expect(new Set(HONOR_STYLE_IDS.map((id) => plateSvg(id))).size).toBe(20);
  });

  it('is built from constants only: nothing a person types can reach the markup (the page size is the only input, and it is a number)', () => {
    const svg = pageSvg('classic', 680, 1001);
    expect(svg).toContain('viewBox="0 0 680 1001"');
    expect(svg).not.toMatch(/<script|onload|onerror|javascript:/i);
  });

  it('tells the page the colours and the place of the name, and falls back to classic gold for an unknown id', () => {
    for (const id of HONOR_STYLE_IDS) {
      const look = honorLook(id);
      expect(look.title).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.nameBox.w).toBeGreaterThan(100);
      expect(look.nameBox.w).toBeLessThanOrEqual(200);
      expect(look.nameBox.cy).toBeGreaterThan(40);
      expect(look.nameBox.cy).toBeLessThan(80);
    }
    expect(honorLook('nope')).toEqual(honorLook('classic'));
    expect(plateSvg('nope')).toBe(plateSvg('classic'));
  });
});

// ---- the twenty styles: the first ten are never edited, the ten added on 2026-11-06 keep to the rules written at the top of utils/honorArt.ts ----
// SHA-256 of how each ORIGINAL style was drawn BEFORE the ten new ones were added (the frame, the flourish, the page at two sizes, and its look). If one of these
// fails, a style that schools already print was changed: undo the change (do not update the numbers) unless the owner asked for that style to change.
const ORIGINAL_FINGERPRINTS: Record<string, { plate: string; divider: string; page: string; pageSmall: string; look: string }> = {
  classic: { plate: 'a4695494002d89de6fecdd254c2571af4e41c9c7ca7a57ef9e1ffd05f6f6d6c2', divider: '5e7e6c9fac5a335d18c539d29dc98ee99209e8ed32b0949442ae8b5d91d6cd9f', page: 'bf6ecfde93709a1f8dc067cf741a807c19274c59f7aa33355cf87e61fbd2a86c', pageSmall: '2aca45fc284e9034aa29ce06f69b2c8eb60a2a05435efab6ba4e38e69ed75958', look: 'fd059a6d63a2948e3b6c5b62ce9fcb5dcc4efec7da2948810e77004add5365c3' },
  lotus: { plate: 'f7e36907f6c55c72bb2b23d3f6cb6cf74daf0286e25b413e00bfe0fd3e39accb', divider: '368cbd11e88a3e2f27502c635fc2e9f96fd4fe0dc2fccbaec2262bbdbb1b73b9', page: '7c63311fd21e6e024fe25a7ea56eecdcd10a09b3e4e335bc6af9698ddb903d0c', pageSmall: '0e4e6a5ee8d85f5acad0d52a481463849487e4e3974a5c522731857934e2859c', look: 'f84c7e1c7a572f4a37acee64bc1494ce4a2be4ae0e2a756c6eb591afd55f6bf5' },
  angkor: { plate: '6c1c1c45069e3a8f142cde3d57ac75e7df19fe7b6f2ff48439958ace411d37dd', divider: '8a198df5ceaeafec23a714a1d47ec614c4b4ea599c06d0c47f14fad277f8641a', page: '2742a16746387ea9fdb03499b0f557f6c156e17d3dadfb3d8dc591c0169951c0', pageSmall: '3c07dd67796ea41a63863a88556e70dd4521b02c52d99db9c7313e78cf3b11ce', look: '78edc84227b01d6c685f49ef934c180af628572142301f0fcbd7b4adff83e5ee' },
  star: { plate: 'cc9090eeb546aeaeac0de786fb7fc109161eddecd1d7f2e26e092fd8861c2813', divider: '8d7d10d68826c929d6d896dcf3d3071849232345158c11281e94d6ecc2860bf0', page: 'fa01a044121d8e59815588dcba9fbfc6b16a2e243ca4cc493b21a800e8554bdc', pageSmall: 'd8d69be27042422ba78f550ef0804540d434bd1cdd8f82d693a43ac99fee0659', look: '3389cab19c4c5c3c67198eb0a6b134be2c770233450cc951971a7247dacf0b00' },
  royal: { plate: '331eabc51c4fddd97d30c31a72a4e62902ca6ea1dd1ef2512b30138ee2599861', divider: '2950dd2fd64a6e50328f7d3982ea8bb67e3bbf4d89ca0563538a2535bdc1254f', page: '26921458f0945280e80546410caafe85f62e9c5b8b55869838cd7fb1dedd1dab', pageSmall: '357f0fe3d350a147c098d2c1793b901647453ef6d8b2ad95623ed7e8f3dda883', look: '5aaa10cf1a8e8c7834b8fdb473eb88779f7a26a2362c4d369ef644dca53241aa' },
  laurel: { plate: 'b26fc6e5788f9683ec5a2acf120268425368ecac37396c32e0c6c12a0c551198', divider: '97241c6f6196ac872e4bab86ac9ddb4559830a6564c6f7554f4484281ff38340', page: 'f9f3f4c03cc431f10a776b950ae3e79c090099c04f98595bcafda1a5145c168a', pageSmall: '08d98d158335c508f6439230af6de29c425df1ba56d9e718d5e08b1a3aff1f52', look: '2c57ffa17a01f7d155ebc5fa5946c8298960d4c289751c7730742c028f9de6ef' },
  guilloche: { plate: 'b7bd2f8174e4a16ed3abc5cfc519e186a06a0f2cde54712cda3038b38ac77057', divider: 'b987a750fd2f197e3ff0323645b76f17b08eeb6755ea1725d92716d7d799aa00', page: 'a0f1058e07156048583f2d19d5abb8a7926f4134f035a2ba76aaedde6fbf8957', pageSmall: '9fbeb5d75e3c43edac62e3dfe4255ec90309eb04c7f4236123e2b7473c1462f1', look: '9c27a413816cf534b4f5b6c4cfb06b6405f5a3c684927327200788021a724490' },
  kids: { plate: '29456e1c06f54c711504c4761a0569cb168c2336384ce428d5adeb03c010b15d', divider: 'da16376b108204c9fe4ea1e48f36c7d224fe67d8e98375da1e72f721e816a1c1', page: 'c2a0be8df28883117494a53b316951adcc22ddeef604ec4505370327992b06ca', pageSmall: 'ca4cbbb7c4097f64f455c6ffefdba9cb3f1d7b4cab26fb829747b13bf78066ab', look: '34823abf8280d32fe18fdf7253bac527df75839dd1213ab39740700e0eddef3a' },
  mono: { plate: '7319e3bf15a9df3219db2a1eef291145676e24458786fdf2fd379f13e60ce73a', divider: '3e171cb1ed2b8d5c41b5918787ac26ddcfbb1958be69e21e05a89caa637df1a2', page: 'cfb5eb0f27f7cdc963b0ff266cfba8e43d145b15bc4befdc89d518be6b06266e', pageSmall: '7691189d8dbe5eadc0c0b9e5c68ce1cd6903a820ec2db1470a8398beca4e1e55', look: 'fa448f0e61569a1493943899af677e67329b86a1e14bd17e49719a9dc13d2126' },
  sun: { plate: '4e3dc843626433ab27332c77f2f89dadb2c965aabd13ef5601b2870ff20ed65a', divider: '3fdf5956692945fe66010f5ff8b99a7b7558b98e921b1df866ed17efa2139e2c', page: '968deb034dc3e3b7cc7e616319ccdbeba8a464195a8efdcf801d5a0ab7a8c610', pageSmall: '77b327d3de27301fda9ef4062a42fb104358aae2254dec75dadcd344321507dc', look: 'ef580de7a4175618b76e7a23bfd3fa3420c12bf779493ed48221d6f9c69939eb' },
};
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const NEW_STYLES = HONOR_STYLE_IDS.slice(10);
const relativeLuminance = (hex: string): number => {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
const contrastWithWhite = (hex: string): number => 1.05 / (relativeLuminance(hex) + 0.05);

describe('the twenty styles', () => {
  it('draws the ten ORIGINAL styles exactly as before the expansion (they come first, in the same order, with the same drawing)', () => {
    expect([...HONOR_STYLE_IDS.slice(0, 10)]).toEqual(Object.keys(ORIGINAL_FINGERPRINTS));
    for (const [id, before] of Object.entries(ORIGINAL_FINGERPRINTS)) {
      expect(sha(plateSvg(id)), `${id} plate`).toBe(before.plate);
      expect(sha(dividerSvg(id)), `${id} flourish`).toBe(before.divider);
      expect(sha(pageSvg(id, 680, 1001)), `${id} page`).toBe(before.page);
      expect(sha(pageSvg(id, 400, 600)), `${id} page, small`).toBe(before.pageSmall);
      expect(sha(JSON.stringify(honorLook(id))), `${id} look`).toBe(before.look);
    }
  });

  it('keeps classic gold as the default and the new ten after the original ten', () => {
    expect(DEFAULT_HONOR_STYLE).toBe('classic');
    expect([...NEW_STYLES]).toEqual(['kbach', 'rice', 'palm', 'rose', 'moon', 'book', 'flag', 'vintage', 'modern', 'wave']);
  });

  it.each([...NEW_STYLES])('%s: the title, the text and the name are dark enough to read on white paper, also in grey (contrast of at least 4.5 : 1)', (id) => {
    const look = honorLook(id);
    for (const colour of [look.title, look.text, look.nameColor]) expect(contrastWithWhite(colour), `${id} ${colour}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([...NEW_STYLES])('%s: its frame sits where the name goes, on a white inside, and the name box is the standard size', (id) => {
    const look = honorLook(id);
    expect(look.nameBox.w).toBe(176);   // narrower than the older styles (a long name shrinks to this), so it never reaches the ends of the frame
    expect(look.nameBox.cy).toBeGreaterThanOrEqual(60);
    expect(look.nameBox.cy).toBeLessThanOrEqual(63);
    expect(plateSvg(id)).toContain('fill="#fff"');
  });

  it('the two light-ink styles use thin dark lines only: vintage draws no solid area, modern only a few small squares, and every colour in them reads on white paper, also in grey', () => {
    for (const id of ['vintage', 'modern'] as const) {
      const parts = [plateSvg(id), dividerSvg(id), pageSvg(id, 680, 1001), plateSvg(id)];
      for (const svg of parts) {
        for (const m of svg.matchAll(/stop-color="(#[0-9a-f]{6})"/g)) expect(contrastWithWhite(m[1]!), `${id} gradient ${m[1]}`).toBeGreaterThanOrEqual(7);   // no pale stop anywhere
        for (const tag of svg.match(/<[a-z]+ [^>]*>/g) ?? []) {
          const fill = / fill="([^"]*)"/.exec(tag)?.[1];
          if (fill === undefined || fill === 'none' || fill === '#fff') continue;
          const smallSquare = id === 'modern' && tag.startsWith('<rect ') && Number(/ width="([0-9.]+)"/.exec(tag)?.[1]) <= 7 && Number(/ height="([0-9.]+)"/.exec(tag)?.[1]) <= 7;
          expect(smallSquare, `${id}: a solid area ${tag.slice(0, 100)}`).toBe(true);
        }
      }
    }
    expect(contrastWithWhite('#6b4f2a')).toBeGreaterThanOrEqual(7);   // vintage's sepia
    expect(contrastWithWhite('#34408f')).toBeGreaterThanOrEqual(7);   // modern's indigo
  });

  it('keeps every new page border inside its box and draws the four corners (the page is 680 x 1001)', () => {
    for (const id of NEW_STYLES) {
      const svg = pageSvg(id, 680, 1001);
      const rects = [...svg.matchAll(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const).filter(([, , w]) => w > 100);   // the border rules, not a small square in a corner
      expect(rects.length, id).toBeGreaterThanOrEqual(1);
      const inset = id === 'flag' ? 10 : 12;   // the border of the newer styles sits 10 to 12 px from the edge (the flag's has three rules, so it starts a little further out)
      for (const [x, y, w, h] of rects) {
        expect(x, id).toBeGreaterThanOrEqual(inset);
        expect(y, id).toBeGreaterThanOrEqual(inset);
        expect(x + w, id).toBeLessThanOrEqual(680 - inset);
        expect(y + h, id).toBeLessThanOrEqual(1001 - inset);
      }
      expect(Math.max(...rects.map(([x]) => x)), `${id}: the innermost rule is clear of the text, which starts 19 px from the edge`).toBeLessThanOrEqual(17);
      for (const corner of [`translate(${inset} ${inset})`, `translate(${680 - inset} ${inset}) scale(-1 1)`, `translate(${inset} ${1001 - inset}) scale(1 -1)`, `translate(${680 - inset} ${1001 - inset}) scale(-1 -1)`]) {
        expect(svg, `${id}: the corner ${corner}`).toContain(`<g transform="${corner}">`);
      }
    }
  });
});

describe('the national header', () => {
  const SETTINGS = path.resolve(__dirname, '..', '..', 'backend', 'src', 'main', 'java', 'kh', 'school', 'sms', 'settings', 'AppSettingsService.java');

  it.skipIf(!existsSync(SETTINGS))('falls back to the same two lines the backend ships as the default of Settings → Printed reports', () => {
    const java = readFileSync(SETTINGS, 'utf8');
    const line = (n: number): string | undefined => new RegExp(`new Def\\("report\\.headerLine${n}", "([^"]*)"`).exec(java)?.[1];
    expect([line(1), line(2)]).toEqual([...NATIONAL_HEADER_FALLBACK]);
  });

  it('is two non-empty lines', () => {
    expect(NATIONAL_HEADER_FALLBACK).toHaveLength(2);
    expect(NATIONAL_HEADER_FALLBACK.every((l) => l.trim().length > 0)).toBe(true);
  });
});

describe('the text boxes keep their spaces and line breaks', () => {
  it('keeps line breaks and the spaces inside the text, turns Windows line ends into one break, and trims only the two ends', () => {
    expect(cleanHonorText('  ការិយាល័យអប់រំ\r\n   ស្រុកគំរូ  ')).toBe('ការិយាល័យអប់រំ\n   ស្រុកគំរូ');
    expect(cleanHonorText('a  b\n\nc')).toBe('a  b\n\nc');
    expect(cleanHonorText('one\rtwo')).toBe('one\ntwo');
    expect(cleanHonorText(null)).toBe('');
    expect(cleanHonorText('   \n  ')).toBe('');
  });

  it('removes control characters other than the line break', () => {
    expect(cleanHonorText('a\u0007b\u0000c\td')).toBe('abcd');
  });

  it('cuts text to 4 lines and 300 characters, and the boxes can tell what is wrong before that happens', () => {
    expect(cleanHonorText('1\n2\n3\n4\n5\n6')).toBe('1\n2\n3\n4');
    expect(cleanHonorText('ក'.repeat(400))).toHaveLength(HONOR_TEXT_MAX);
    expect(honorTextProblem('1\n2\n3\n4')).toBeNull();
    expect(honorTextProblem('1\n2\n3\n4\n5')).toBe('lines');
    expect(honorTextProblem('ក'.repeat(300))).toBeNull();
    expect(honorTextProblem('ក'.repeat(301))).toBe('length');
    expect(honorTextProblem('')).toBeNull();
    expect(honorTextsProblem({ ...OPTIONS })).toBeNull();
    expect(honorTextsProblem({ ...OPTIONS, titleLeft: '1\n2\n3\n4\n5' })).toBe('lines');
  });

  it('survives the trip through the print address with its breaks and spaces', () => {
    const typed = { ...OPTIONS, header: 'ការិយាល័យ  អប់រំ\nស្រុកគំរូ\n{class}', dateLines: 'ថ្ងៃសុក្រ\n២រោច\n\n{date}', subtitle: 'លទ្ធផល\n  ប្រចាំខែ' };
    const back = parseHonorQuery(queryOf(honorPrintPath(3, 5, typed))).options;
    expect(back.header).toBe(typed.header);
    expect(back.dateLines).toBe(typed.dateLines);
    expect(back.subtitle).toBe(typed.subtitle);
  });
});

describe('how each box is set (font style)', () => {
  it('starts with the look of the school\'s own sample: the subtitle in the title font, the two signature titles bold, the rest plain, all centred; only the date lines shrink to stay on one line', () => {
    const standard = parseHonorFormats('');
    expect(standard).toEqual(STANDARD_HONOR_FORMATS);
    expect(standard.subtitle.font).toBe('title');
    expect(standard.header.font).toBe('text');
    expect(HONOR_TEXT_KEYS.every((k) => standard[k].align === 'center' && standard[k].size === 'M' && !standard[k].italic && !standard[k].underline)).toBe(true);
    expect(HONOR_TEXT_KEYS.filter((k) => standard[k].bold)).toEqual(['titleRight', 'titleLeft']);
    expect(HONOR_TEXT_KEYS.filter((k) => standard[k].fit)).toEqual(['dateLines']);
  });

  it('reads only the fields it knows, with the values it knows; anything else keeps the standard look of that field', () => {
    const f = parseHonorFormats('{"header":{"font":"title","size":"XL","bold":true,"italic":true,"underline":true,"align":"left","fit":true},"subtitle":{"size":"HUGE","bold":"yes","colour":"red"},"nobody":{"bold":true}}');
    expect(f.header).toEqual({ font: 'title', size: 'XL', bold: true, italic: true, underline: true, align: 'left', fit: true });
    expect(f.subtitle).toEqual(STANDARD_HONOR_FORMATS.subtitle);
    expect(parseHonorFormats('not json')).toEqual(STANDARD_HONOR_FORMATS);
    expect(parseHonorFormats('[1,2]')).toEqual(STANDARD_HONOR_FORMATS);
    expect(parseHonorFormats(null)).toEqual(STANDARD_HONOR_FORMATS);
  });

  it('is saved as only what differs from the standard (empty when nothing does) and reads back the same', () => {
    expect(honorFormatsJson(STANDARD_HONOR_FORMATS)).toBe('');
    const changed = parseHonorFormats('{"dateLines":{"size":"S","fit":false},"titleLeft":{"bold":false,"align":"right"}}');
    const json = honorFormatsJson(changed);
    expect(JSON.parse(json)).toEqual({ dateLines: { size: 'S', fit: false }, titleLeft: { bold: false, align: 'right' } });
    expect(parseHonorFormats(json)).toEqual(changed);
  });

  it('becomes the box\'s style: its font, its size (S, M, L and XL are 0.85, 1, 1.2 and 1.45 of the box\'s own size), weight, slant, underline, alignment and line handling', () => {
    const plainStyle = honorFormatStyle('dateLines', STANDARD_HONOR_FORMATS.dateLines);
    expect(plainStyle).toMatchObject({ fontFamily: 'inherit', fontWeight: '400', fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', whiteSpace: 'pre' });
    expect(plainStyle.fontSize).toBe('calc(11pt * var(--fit, 1))');
    const big = honorFormatStyle('subtitle', { font: 'title', size: 'XL', bold: true, italic: true, underline: true, align: 'right', fit: false });
    expect(big).toMatchObject({ fontFamily: 'var(--sms-title-font)', fontWeight: '700', fontStyle: 'italic', textDecoration: 'underline', textAlign: 'right', whiteSpace: 'pre-wrap' });
    expect(big.fontSize).toBe('calc(17.835pt * var(--fit, 1))');
    expect(honorFormatStyle('header', { ...STANDARD_HONOR_FORMATS.header, size: 'S' }).fontSize).toBe('calc(8.925pt * var(--fit, 1))');
  });

  it('travels in the print address only when it differs from the standard, and an address without it means the standard look', () => {
    expect(honorPrintPath(1, 2, { ...OPTIONS, formats: STANDARD_HONOR_FORMATS })).not.toContain('formats=');
    const withFormats = honorPrintPath(1, 2, OPTIONS);
    expect(withFormats).toContain('formats=');
    expect(parseHonorQuery(queryOf(withFormats)).options.formats).toEqual(OPTIONS.formats);
    expect(parseHonorQuery({ examinationId: '4' }).options.formats).toEqual(STANDARD_HONOR_FORMATS);
  });
});

describe('the words in braces', () => {
  const parts = { school: 'សាលាបឋមសិក្សាបាណន់', classLabel: 'ថ្នាក់ទី១ ក', exam: 'ប្រឡងខែតុលា' };

  it('are the school, the class, the examination and the date that was chosen (its Khmer long form, month name and year)', () => {
    const v = honorTokenValues('2026-10-31', parts);
    expect(v.school).toBe(parts.school);
    expect(v.class).toBe(parts.classLabel);
    expect(v.exam).toBe(parts.exam);
    expect(v.date).toContain('ថ្ងៃទី');
    expect(v.date).toContain('31');
    expect(v.date).toContain('2026');
    expect(v.month).toBe('តុលា');
    expect(v.year).toBe('2026');
    expect(honorTokenValues('2026-07-04', parts).month).toBe('កក្កដា');
  });

  it('follow the date: another date gives another month, year and date line (an empty date means today)', () => {
    const a = honorTokenValues('2026-10-31', parts);
    const b = honorTokenValues('2027-02-01', parts);
    expect([b.month, b.year]).toEqual(['កុម្ភៈ', '2027']);
    expect(b.date).not.toBe(a.date);
    expect(honorTokenValues('', parts).year).toBe(String(new Date().getFullYear()));
  });

  it('are filled in everywhere in a text, several times, with the line breaks and spaces around them kept', () => {
    const v = honorTokenValues('2026-10-31', parts);
    expect(expandHonorText('{school}\n{class}', v)).toBe(`${parts.school}\n${parts.classLabel}`);
    expect(expandHonorText('លទ្ធផលប្រចាំខែ{month} {year}\n  {exam} / {exam}', v)).toBe(`លទ្ធផលប្រចាំខែតុលា 2026\n  ${parts.exam} / ${parts.exam}`);
    expect(expandHonorText('បាណន់ ត្រូវនឹង{date}', v)).toBe(`បាណន់ ត្រូវនឹង${v.date}`);
  });

  it('leave anything else in braces, and text without any, exactly as typed', () => {
    const v = honorTokenValues('2026-10-31', parts);
    expect(expandHonorText('{other} {School} ថេរ', v)).toBe('{other} {School} ថេរ');
    expect(expandHonorText('', v)).toBe('');
  });
});

describe('the saved default', () => {
  it('is five names, classic gold and the standard wording until the school saves something', () => {
    expect(STANDARD_HONOR_DEFAULTS).toEqual({ count: 5, style: 'classic', allClasses: false, formats: STANDARD_HONOR_FORMATS, ...STANDARD_HONOR_TEXTS });
    expect(honorDefaultsFrom({})).toEqual(STANDARD_HONOR_DEFAULTS);
    expect(STANDARD_HONOR_TEXTS.header).toBe('{school}\n{class}');
  });

  it('is read from the settings the server sends; anything odd falls back, and a box saved empty stays empty', () => {
    const saved = honorDefaultsFrom({
      'honor.count': '10', 'honor.style': 'laurel', 'honor.header': ' កម្រង\n{school}\n{class} ', 'honor.subtitle': '', 'honor.dateLines': 'x', 'honor.titleRight': 'គ្រូបន្ទុកថ្នាក់', 'honor.titleLeft': 'ក\nខ', 'honor.allClasses': 'true',
    });
    expect(saved).toEqual({ count: 10, style: 'laurel', allClasses: true, formats: STANDARD_HONOR_FORMATS, header: 'កម្រង\n{school}\n{class}', subtitle: '', dateLines: 'x', titleRight: 'គ្រូបន្ទុកថ្នាក់', titleLeft: 'ក\nខ' });
    expect(honorDefaultsFrom({ 'honor.count': '7', 'honor.style': 'gold', 'honor.allClasses': 'maybe' })).toEqual(STANDARD_HONOR_DEFAULTS);
  });

  it('saves every key, and what is saved reads back as the same default', () => {
    const wanted = { count: 10 as const, style: 'sun' as const, allClasses: true, formats: parseHonorFormats('{"header":{"bold":true,"size":"L"}}'), header: 'ក\n\nខ\n{class}', subtitle: 'លទ្ធផល{exam}\nសម្រាប់ខែនេះ', dateLines: 'បាណន់ ត្រូវនឹង{date}', titleRight: '', titleLeft: 'បានឃើញ' };
    const settings = honorSettingsOf(wanted);
    expect(Object.keys(settings).sort()).toEqual(['honor.allClasses', 'honor.count', 'honor.dateLines', 'honor.formats', 'honor.header', 'honor.style', 'honor.subtitle', 'honor.titleLeft', 'honor.titleRight']);
    expect(honorDefaultsFrom(settings)).toEqual(wanted);
  });

  it.skipIf(!existsSync(SETTINGS_JAVA))('has the same standard wording as the backend ships for the five texts, and the same twenty styles', () => {
    const java = readFileSync(SETTINGS_JAVA, 'utf8');
    for (const key of HONOR_TEXT_KEYS) {
      const shipped = new RegExp(`new Def\\("honor\\.${key}", "((?:[^"\\\\]|\\\\.)*)"`).exec(java)?.[1];
      expect(shipped, `honor.${key} in the backend`).toBeDefined();
      expect(JSON.parse(`"${shipped}"`), `honor.${key}`).toBe(STANDARD_HONOR_TEXTS[key]);
    }
    const listed = /HONOR_STYLES = List\.of\(([^)]*)\)/.exec(java)?.[1] ?? '';
    expect([...listed.matchAll(/"([a-z]+)"/g)].map((m) => m[1])).toEqual([...HONOR_STYLE_IDS]);
  });
});

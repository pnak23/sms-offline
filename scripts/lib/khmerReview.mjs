// The pure parts of the Khmer review tooling (scripts/khmer-review.mjs): which texts belong to a review section, what a reviewer's correction may and may not change, and how
// a sheet for the reviewer and a before / after report are written. Nothing here reads or writes a file, so it is unit-tested (desktop/test/khmerReview.test.mjs).

/** A review section of frontend/i18n/REVIEW.md: its title, which keys of km.json it covers, and what a reviewer should look at first. */
export const SECTIONS = {
  20: {
    title: 'The premium dashboard: the hero and the six charts (frontend/i18n/REVIEW.md section 20)',
    focus: 'the **empty-state** sentences (`dashboard.charts.noYear`, `*.empty`) must not read like a fault; the sentence about **gaps** (`dashboard.charts.attendance.summary`, `.gap`: a day with no record is shown as a gap, never as zero); the **capacity note** (`dashboard.charts.fill.note`); the **unofficial-grading notice** (`dashboard.charts.exam.unofficial`); the sentence that the two **currencies are never added together** (`dashboard.charts.fees.summary`); and the names of the charts; and the label of the **information button on the quiet backup line** (`dashboard.backupLimitsToggle`), which opens the existing sentence about what a backup kept only on the laptop cannot protect against.',
    match: (key) => key.startsWith('dashboard.hero.') || key.startsWith('dashboard.charts.') || key === 'dashboard.backupLimitsToggle',
  },
  19: {
    title: 'The weekly timetable (frontend/i18n/REVIEW.md section 19)',
    focus: 'the **empty-state** sentences (`timetable.unconfigured*`, `timetable.classEmpty*`, `timetable.teacherEmpty`) must not read like a fault; the **reason for each skipped lesson** (`timetable.skip.*`); the sentence that refuses a clash (`timetable.clash`); and the word for "timetable" itself.',
    match: (key) => key === 'nav.timetable' || key === 'nav.timetableSettings' || key === 'students.timetableTitle' || key === 'teachers.timetableTitle'
      || key === 'acceptance.draft.timetableSlots' || key.startsWith('timetable.') || key.startsWith('reports.timetable') || key.startsWith('acceptance.item.timetable-slots.')
      || key.startsWith('error.TIMETABLE_') || key.startsWith('validation.TIMETABLE_') || key.startsWith('audit.action.TIMETABLE_') || key.startsWith('audit.entity.timetable_'),
  },
};

/** { "a": { "b": "x" } } -> { "a.b": "x" } (only texts; a text is a string). */
export function flatten(value, prefix = '', out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[path] = child;
    else if (child && typeof child === 'object') flatten(child, path, out);
  }
  return out;
}

/** A section id, or a list of them (the review of 2026-11 covers 19 and 20 together). */
const idsOf = (sectionId) => (Array.isArray(sectionId) ? sectionId : [sectionId]);

/** The keys of a section (or of several), in the order they have in km.json. */
export function sectionKeys(km, sectionId) {
  const sections = idsOf(sectionId).map((id) => {
    const section = SECTIONS[id];
    if (!section) throw new Error(`unknown section ${id}`);
    return section;
  });
  return Object.keys(flatten(km)).filter((key) => sections.some((s) => s.match(key)));
}

/** "19 and 20" for the titles and the file names. */
export const sectionLabel = (sectionId) => idsOf(sectionId).join('-');

/** The words in braces, e.g. "{n}" -> ["n"], sorted (a correction must keep exactly the same ones: the program fills them in). */
export function placeholders(text) {
  return [...String(text).matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).sort();
}

/** What is wrong with replacing `before` by `after` for `key`; an empty list means the correction may be applied. */
export function problemsOf(key, before, after) {
  const problems = [];
  if (typeof after !== 'string' || after.trim() === '') return [`${key}: the corrected text is empty or not text`];
  if (placeholders(before).join('|') !== placeholders(after).join('|')) {
    problems.push(`${key}: the words in braces must stay exactly as they are (now ${JSON.stringify(placeholders(before))}, corrected ${JSON.stringify(placeholders(after))}); the program fills them in`);
  }
  // characters that mean something to the message format of the screen texts: a pipe makes plural forms, "@" a link to another text, "<" markup, a line break a second line
  for (const [char, why] of [['|', 'a pipe splits a text into plural forms'], ['@', 'an at-sign links to another text'], ['<', 'markup is not allowed'], ['\n', 'a line break']]) {
    if (after.includes(char) && !before.includes(char)) problems.push(`${key}: the corrected text contains "${char === '\n' ? '\\n' : char}" (${why})`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(after)) problems.push(`${key}: the corrected text contains a control character`);
  return problems;
}

function setPath(object, key, value) {
  const parts = key.split('.');
  let node = object;
  for (const part of parts.slice(0, -1)) node = node[part];
  node[parts.at(-1)] = value;
}

/**
 * Applies a reviewer's corrections ({ key: corrected text }) to a copy of km.json. A key that does not exist, or a key outside the section unless `anyKey`, is refused: a typo
 * must never create a new text. Returns the new object, the changes (key, before, after), the corrections that changed nothing, and every problem found (nothing is applied if
 * there is any problem: it is all or nothing, so a half-applied review cannot happen).
 */
export function applyCorrections(km, corrections, { sectionId = null, anyKey = false } = {}) {
  const flat = flatten(km);
  const allowed = sectionId && !anyKey ? new Set(sectionKeys(km, sectionId)) : null;
  const problems = [];
  const changes = [];
  const unchanged = [];
  for (const [key, after] of Object.entries(corrections)) {
    if (!(key in flat)) { problems.push(`${key}: there is no such text in km.json`); continue; }
    if (allowed && !allowed.has(key)) { problems.push(`${key}: not part of section ${sectionLabel(sectionId)} (use --any-key to correct a text outside it)`); continue; }
    const before = flat[key];
    if (after === before) { unchanged.push(key); continue; }
    const found = problemsOf(key, before, after);
    if (found.length > 0) { problems.push(...found); continue; }
    changes.push({ key, before, after });
  }
  const result = JSON.parse(JSON.stringify(km));
  if (problems.length === 0) for (const change of changes) setPath(result, change.key, change.after);
  return { km: problems.length === 0 ? result : km, changes: problems.length === 0 ? changes : [], unchanged, problems };
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The sheet a reviewer reads and corrects: every text of the section in full, one row each, with an empty column for the correction. */
export function sheetMarkdown(km, sectionId) {
  const flat = flatten(km);
  const keys = sectionKeys(km, sectionId);
  const rows = keys.map((key, i) => `| ${i + 1} | \`${key}\` | ${cell(flat[key])} | | |`);
  const titles = idsOf(sectionId).map((id) => SECTIONS[id].title).join(' + ');
  const focus = idsOf(sectionId).map((id) => SECTIONS[id].focus).join(' **Then**, for the other part: ');
  return `# Khmer wording review sheet — ${titles}

Generated from \`frontend/i18n/locales/km.json\`. **Every text below was written by an AI assistant, not by a Khmer speaker.** Please read each one on its own and as it appears on the screen, and write a correction (or leave the column empty if it is right).

* Words in braces, such as \`{n}\`, \`{day}\`, \`{className}\`, are filled in by the program: keep them exactly as they are, anywhere in the sentence.
* Do not use the characters \`|\`, \`@\` or \`<\`, and write each text on one line.
* The points to look at first: ${focus}

${rows.length} texts.

| # | Key | Current text | Correction | Note |
|---|---|---|---|---|
${rows.join('\n')}
`;
}

/** The report of a review: what changed, key by key, before and after (shown to the owner). */
export function outcomeMarkdown({ sectionId, reviewer, date, changes, unchanged, total }) {
  const rows = changes.map((c) => `| \`${c.key}\` | ${cell(c.before)} | ${cell(c.after)} |`);
  return `# Khmer wording review outcome — ${idsOf(sectionId).map((id) => SECTIONS[id].title).join(' + ')}

* Reviewer: ${reviewer || '(not given)'}
* Date: ${date}
* Texts in the section: ${total}. **Corrected: ${changes.length}.** Left as they were: ${total - changes.length - unchanged.length}${unchanged.length ? ` (${unchanged.length} correction(s) were identical to the current text)` : ''}.

${changes.length === 0 ? 'Nothing was changed.' : `| Key | Before | After |\n|---|---|---|\n${rows.join('\n')}`}
`;
}

// ---- what changed in the sources between two looks (scripts/release-preflight.mjs --compare) -------------------------------------------------------------------------------------

/** Two { path: sha256 } maps -> what was added, changed and removed. */
export function diffManifests(before, after) {
  const added = Object.keys(after).filter((p) => !(p in before)).sort();
  const removed = Object.keys(before).filter((p) => !(p in after)).sort();
  const changed = Object.keys(after).filter((p) => p in before && before[p] !== after[p]).sort();
  return { added, removed, changed };
}

/** The files a Khmer review may change without any other source changing. */
export const KHMER_REVIEW_FILES = ['frontend/i18n/locales/km.json', 'frontend/i18n/REVIEW.md'];

/** True when every difference is a Khmer-wording file. */
export function onlyKhmerWording(diff) {
  return [...diff.added, ...diff.removed, ...diff.changed].every((p) => KHMER_REVIEW_FILES.includes(p));
}

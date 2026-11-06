// A small, strict Markdown converter for the Khmer user guide (docs/user-guide/USER-GUIDE-KM.md). It supports only what the guide uses, so a typo cannot silently become something else:
//   # chapter  ## section  ### operation  #### sub-heading      paragraphs      - bullets / 1. numbers (nested by 2 spaces)      > callouts      | tables |      ---      ```code```
//   ![caption](SCREENSHOTS/file.png)  on a line of its own = a numbered figure      <!-- pagebreak -->      **bold**  *italic*  `code`  [text](url)
//   «label» = the exact words of a button, menu or field on the screen (shown as a chip; scripts/check-guide.mjs checks every one against frontend/i18n/locales/km.json)
// A paragraph that starts with **គោលបំណង៖**, **ជំហានទី…៖**, **លទ្ធផល៖**, **ចំណាំ៖** or **ប្រុងប្រយ័ត្ន៖** becomes a coloured block (the guide's fixed format for every operation).
// Nothing here reads a file or the network: it is a pure function, so it is the same on every machine.

const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
/** 12 -> "១២" */
export const khmerNumber = (n) => String(n).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The fixed block labels of an operation and the CSS class each one gets. */
const BLOCKS = [
  [/^គោលបំណង៖/, 'blk-purpose'],
  [/^ជំហានទី[០-៩]+៖/, 'blk-step'],
  [/^លទ្ធផល៖/, 'blk-result'],
  [/^ចំណាំ៖/, 'blk-note'],
  [/^ប្រុងប្រយ័ត្ន៖/, 'blk-warning'],
];

/** Inline markup of one line of text (already free of block markers). */
export function inline(text) {
  const holders = [];
  const hold = (html) => { holders.push(html); return `\u0000${holders.length - 1}\u0000`; };
  let s = text;
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${esc(code)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => hold(`<img src="${esc(src)}" alt="${esc(alt)}">`));
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => hold(`<a href="${esc(href)}">${esc(label)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/«([^»]+)»/g, '<span class="ui">«$1»</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => holders[Number(i)]);
}

function parseTable(lines) {
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
  const rows = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** { html, headings: [{ level, text, id }], figures } for a Markdown source. `resolve(src)` turns an image path of the guide into the address the page loads. */
export function mdToHtml(source, { resolve = (src) => src, cropSidebar = () => false } = {}) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let figures = 0;
  let i = 0;

  const listItems = (startIndent, ordered) => {
    // collects consecutive list lines at this indent (and deeper, recursively) into <ul>/<ol>
    const tag = ordered ? 'ol' : 'ul';
    const items = [];
    const marker = ordered ? /^(\s*)(\d+)\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;
    while (i < lines.length) {
      const m = marker.exec(lines[i]);
      if (!m || m[1].length !== startIndent) break;
      let body = ordered ? m[3] : m[2];
      i++;
      let nested = '';
      while (i < lines.length) {
        const deeper = /^(\s+)([-*]|\d+\.)\s+/.exec(lines[i]);
        if (deeper && deeper[1].length > startIndent) nested += listItems(deeper[1].length, /\d+\./.test(deeper[2]));
        else if (/^\s+\S/.test(lines[i]) && !deeper && lines[i].length - lines[i].trimStart().length > startIndent) { body += ' ' + lines[i].trim(); i++; }
        else break;
      }
      items.push(`<li>${inline(body)}${nested}</li>`);
    }
    return `<${tag}>${items.join('')}</${tag}>`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    if (/^<!--\s*pagebreak\s*-->\s*$/.test(line)) { out.push('<div class="pagebreak"></div>'); i++; continue; }
    if (/^<!--/.test(line)) { while (i < lines.length && !/-->/.test(lines[i])) i++; i++; continue; }   // any other comment is a note to the editor

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = `h-${headings.length + 1}`;
      headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const fig = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (fig) {
      figures++;
      const image = `<img src="${esc(resolve(fig[2]))}" alt="${esc(fig[1])}">`;
      out.push(`<figure>${cropSidebar(fig[2]) ? `<div class="fig-crop">${image}</div>` : image}<figcaption><span class="fig-no">រូបទី ${khmerNumber(figures)}៖</span> ${inline(fig[1])}</figcaption></figure>`);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${mdToHtml(quote.join('\n'), { resolve }).html}</blockquote>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      out.push(parseTable(rows));
      continue;
    }
    if (/^(\s*)[-*]\s+/.test(line)) { out.push(listItems(/^(\s*)/.exec(line)[1].length, false)); continue; }
    if (/^(\s*)\d+\.\s+/.test(line)) { out.push(listItems(/^(\s*)/.exec(line)[1].length, true)); continue; }

    // a paragraph: consecutive plain lines
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|>|\||```|!\[|<!--|(\s*)([-*]|\d+\.)\s+)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    const text = para.join(' ');
    const plain = text.replace(/^\*\*/, '');
    const block = BLOCKS.find(([re]) => re.test(plain));
    out.push(block ? `<p class="blk ${block[1]}">${inline(text)}</p>` : `<p>${inline(text)}</p>`);
  }
  return { html: out.join('\n'), headings, figures };
}

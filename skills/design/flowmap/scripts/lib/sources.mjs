// Checks that each source points at something real and plausibly supports its claim.
// A source is checked when it names a file: `path`, `path:12`, `path:12-18`, `path#heading`
// or `path, detail`. URLs and notes such as "user said" are listed as not checkable.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { sources } from './graph.mjs';

// A range longer than this is a section, not a line, so the label is not compared with it.
const MAX_COMPARED_LINES = 40;

const STOP = new Set(`the and for with from into onto that this then than when what where which who whom whose
are was were been being has have had does did doing will would can could should may might must shall
not nor but you your yours our ours their theirs its his her him she they them there here also just only
very more most some any each every all both either neither one two once out off over under again about
after before above below between through during until while per via a an to of in on at by as or if is
it be do no so up we my me us`.split(/\s+/));

/**
 * Parse a source string. Returns { kind: 'file', path, from?, to?, anchor?, detail? },
 * { kind: 'url' } or { kind: 'note' }.
 */
export function parseSource(text, { isFile } = {}) {
  const s = text.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return { kind: 'url', text: s };
  const tail = '(?::(\\d+)(?:-(\\d+))?)?(?:#([^\\s,]+))?(?:,\\s*(.+))?$';
  // A Windows path may start with a drive, such as `C:\repo\a.ts:12`. Its colon is not a line number.
  const drive = '(?:[A-Za-z]:[\\\\/])?';
  // A path with an extension or a slash is a file. A bare word, such as `Makefile`, is a file only when it exists.
  let m = s.match(new RegExp(`^(${drive}(?:[^\\s:#,]+\\.[A-Za-z0-9]+|[^\\s:#,]*\\/[^\\s:#,]+))${tail}`));
  if (!m && isFile) {
    // A path with spaces, such as `docs/My notes.md:3`, or a bare name: a file only when it exists.
    for (const head of ['[^:#,]+\\.[A-Za-z0-9]+', '[^\\s:#,]+']) {
      m = s.match(new RegExp(`^(${drive}${head})${tail}`));
      if (m && isFile(m[1])) break;
      m = null;
    }
  }
  if (!m) return { kind: 'note', text: s };
  const [, path, from, to, anchor, detail] = m;
  return {
    kind: 'file', text: s, path,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : from ? Number(from) : undefined,
    anchor, detail,
  };
}

// Words that name a branch rather than what happens. Code rarely writes them, so an arrow
// labelled only with these is checked against the boxes it joins instead.
const BRANCH = new Set(['yes', 'true', 'false', 'else', 'otherwise', 'ok', 'okay']);

// Scripts whose words are short and carry particles, such as 결제를 for 결제: 2 letters make a word,
// and a cited word that starts with the claim's word matches it.
const CJK = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SCRIPTS = ['Latin', 'Hangul', 'Han', 'Hiragana', 'Katakana', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Thai', 'Devanagari']
  .map((name) => [name, new RegExp(`\\p{Script=${name}}`, 'u')]);

/** The writing systems a word uses, such as Latin or Hangul. Digits use none. */
const scriptsOf = (word) => SCRIPTS.filter(([, re]) => re.test(word)).map(([name]) => name);

/** Words a reader would use to name the claim: lowercase, no stop words, 3 letters or more (2 in Korean, Chinese or Japanese). */
export function contentWords(text) {
  return [...new Set(String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= (CJK.test(w) ? 2 : 3) && !STOP.has(w)))];
}

/** A rough stem, so "tasks" meets "task", "uses" meets "use", "boxes" meets "box" and "reviewed" meets "review". */
export function stem(w) {
  if (w.length > 4 && /(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The words in cited text, without stop words. camelCase and snake_case are split, so `getCart` holds "cart". */
const wordsIn = (text) => String(text).replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w));

/**
 * True when the cited text has any of the words as a whole word, or a word with the same stem,
 * or one that starts with the same 5 letters. Whole words, so "art" does not meet "start".
 */
export function mentionsAny(words, text) {
  const found = new Set(wordsIn(text));
  const stems = new Set([...found].map(stem));
  const list = [...found];
  return words.some((w) => found.has(w)
    || (stem(w).length >= 3 && stems.has(stem(w)))
    || (w.length > 5 && list.some((t) => t.startsWith(w.slice(0, 5))))
    || (CJK.test(w) && list.some((t) => t.startsWith(w))));
}

/** True when no claim word shares a writing system with the cited text, such as a Korean label on an English line. */
export function otherScript(words, text) {
  const cited = new Set(wordsIn(text).flatMap(scriptsOf));
  const claim = words.flatMap(scriptsOf);
  return claim.length > 0 && cited.size > 0 && !claim.some((s) => cited.has(s));
}

/** The words an arrow is checked by: its label, or the boxes it joins when the label only names a branch. */
export function arrowWords(label, fromLabel, toLabel) {
  const own = contentWords(label ?? '').filter((w) => !BRANCH.has(w));
  return own.length ? own : contentWords([fromLabel, toLabel].filter(Boolean).join(' '));
}

/** True when `path` is inside `root` (or is `root`). */
const isUnder = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

const slug = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

/**
 * Check every source in a valid graph against the files under `root`.
 * `compared` counts cited lines whose words were compared with the claim; `otherScript` lists the
 * sources whose cited lines are in another writing system than the claim, so words were not compared.
 * @returns {{ errors: string[], warnings: string[], checked: number, compared: number,
 *             notCheckable: string[], otherScript: string[] }}
 */
export function checkSources(graph, root) {
  const errors = [];
  const warnings = [];
  const notCheckable = new Set();
  const otherScripts = [];
  let checked = 0;
  let compared = 0;
  const files = new Map(); // path -> lines | null
  const read = (path) => {
    if (!files.has(path)) {
      let lines = null;
      try { if (statSync(path).isFile()) lines = readFileSync(path, 'utf8').split(/\r?\n/); } catch { /* missing */ }
      files.set(path, lines);
    }
    return files.get(path);
  };
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const claims = [
    ...graph.nodes.map((n) => ({ item: n, name: `Box "${n.label}"`, words: contentWords(n.label) })),
    ...(graph.edges ?? []).map((e) => ({
      item: e,
      name: `Arrow "${label.get(e.from)}" → "${label.get(e.to)}"${e.label ? ` (${e.label})` : ''}`,
      words: arrowWords(e.label, label.get(e.from), label.get(e.to)),
    })),
  ];
  const skillFiles = new Set();
  const where = (p) => (isAbsolute(p) ? p : resolve(root, p));
  const isFile = (p) => read(where(p)) !== null;

  for (const { item, name, words } of claims) {
    // A claim whose file sources are all whole files, or `file, note`, has no line to compare.
    const loose = [];
    let anchored = false;
    for (const text of sources(item) ?? []) {
      const src = parseSource(text, { isFile });
      if (src.kind !== 'file') { notCheckable.add(src.text); continue; }
      checked++;
      if (src.from !== undefined || src.anchor || /^[A-Za-z_$][\w$.]*\(\)$/.test(src.detail ?? '')) anchored = true;
      else loose.push(text);
      const path = where(src.path);
      if (!isUnder(root, path)) {
        errors.push(`${name}: source "${text}" is outside \`root\` (${root}). Set \`root\` to a folder that holds every file source.`);
        continue;
      }
      const lines = read(path);
      if (!lines) {
        errors.push(`${name}: source "${text}" names a file that is not there (${path}). Fix the path, or set \`root\` to the folder the paths start from. If it is not a file, write it as a note.`);
        continue;
      }
      if (basename(path) === 'SKILL.md') skillFiles.add(path);
      if (src.from !== undefined) {
        if (src.from < 1) { errors.push(`${name}: source "${text}" cites line ${src.from}, but lines start at 1.`); continue; }
        if (src.to < src.from) { errors.push(`${name}: source "${text}" has a line range that runs backwards.`); continue; }
        const last = lines.at(-1) === '' ? lines.length - 1 : lines.length;
        if (src.to > last) { errors.push(`${name}: source "${text}" points past the end of the file, which has ${last} lines.`); continue; }
        if (words.length && src.to - src.from < MAX_COMPARED_LINES) {
          // Only the cited lines count, not the path, so `src/payment/x.ts:2` does not support
          // "Payment check" by its folder name. One exception: a skill's own SKILL.md supports a box
          // named after the skill, so the skill's folder name counts.
          const skill = basename(path) === 'SKILL.md' ? `${basename(dirname(path))}\n` : '';
          const cited = `${skill}${lines.slice(src.from - 1, src.to).join('\n')}`;
          if (otherScript(words, cited)) {
            otherScripts.push(`${name}: ${text}`);
          } else {
            compared++;
            if (!mentionsAny(words, cited)) {
              warnings.push(`${name}: the cited lines (${text}) share no words with the claim. Check that they say it, then cite the line that does, or drop the source so the claim stays dashed.`);
            }
          }
        }
      }
      if (src.anchor && /\.mdx?$/i.test(path)) {
        const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => slug(l.replace(/^#+\s*/, '')));
        if (!headings.includes(src.anchor.toLowerCase())) warnings.push(`${name}: source "${text}" names a heading that ${src.path} does not have.`);
      }
      const code = src.detail?.match(/^([A-Za-z_$][\w$.]*)\(\)$/);
      if (code && !lines.some((l) => l.includes(code[1].split('.').at(-1)))) {
        warnings.push(`${name}: source "${text}" names ${code[0]}, which ${src.path} does not mention.`);
      }
    }
    if (loose.length && !anchored) {
      const [names, verb] = loose.length === 1 ? ['names a file', 'it says'] : ['name files', 'they say'];
      warnings.push(`${name}: ${loose.map((t) => `"${t}"`).join(', ')} ${names} but no line, #heading or name(), so nothing checks that ${verb} the claim. Cite the line that says it.`);
    }
  }

  // A skill's SKILL.md that hands off to a sibling skill the graph does not show.
  const shown = [...graph.nodes.map((n) => n.label), ...[graph.leavesOut ?? []].flat()].join('\n').toLowerCase();
  for (const file of skillFiles) {
    const parent = dirname(dirname(file));
    let siblings = [];
    try {
      siblings = readdirSync(parent).filter((d) => d !== basename(dirname(file)) && existsSync(join(parent, d, 'SKILL.md')));
    } catch { /* no parent folder */ }
    const text = read(file).join('\n');
    for (const skill of siblings) {
      const mention = new RegExp(`(^|[^\\w/-])/${skill.replace(/[-]/g, '\\-')}(?![\\w-])`);
      if (mention.test(text) && !shown.includes(skill.toLowerCase())) {
        warnings.push(`${relative(root, file).split(sep).join('/')} mentions /${skill}, which the graph does not show. Add it, or name it in \`leavesOut\`.`);
      }
    }
  }
  return { errors, warnings: [...new Set(warnings)], checked, compared, notCheckable: [...notCheckable], otherScript: otherScripts };
}

/**
 * Định dạng trích dẫn APA 7 / BibTeX / RIS từ dữ liệu Crossref (CSL rút gọn).
 * Thiếu dữ liệu → ghi rõ "[thiếu …]" thay vì bịa.
 */
import type { CslItem } from './publication';

export interface CiteInput {
  csl: CslItem | null;
  /** Dự phòng khi chưa có CSL */
  fallback: { title: string; journal: string | null; year: number | null; doi: string | null; publisher: string | null };
}

const initials = (given: string | null) =>
  (given ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((p) => (/^[A-ZÀ-Ỹ]\.?$/i.test(p) ? p[0].toUpperCase() + '.' : p ? p[0].toUpperCase() + '.' : ''))
        .join('-')
    )
    .join(' ');

function apaAuthors(authors: CslItem['authors']): string {
  const names = authors.map((a) => (a.given ? `${a.family}, ${initials(a.given)}` : a.family));
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(', ')}, . . . ${names[names.length - 1]}`;
}

const pages = (c: CslItem) => (c.page ? c.page.replace(/-+/g, '–') : c.articleNumber ? `Article ${c.articleNumber}` : '');
const doiUrl = (doi: string | null) => (doi ? `https://doi.org/${doi}` : '');
const endDot = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/** APA 7 — trả về cả bản text và bản HTML (in nghiêng tên tạp chí, số tập) */
export function apa(input: CiteInput): { text: string; html: string; complete: boolean } {
  const c = input.csl;
  if (!c) {
    const f = input.fallback;
    const parts = [`[thiếu tác giả] (${f.year ?? 'n.d.'}).`, endDot(f.title)];
    if (f.journal) parts.push(`${f.journal}.`);
    if (f.doi) parts.push(doiUrl(f.doi));
    const text = parts.join(' ');
    const html = text.replace(f.journal ? `${f.journal}.` : '\u0000', f.journal ? `<i>${esc(f.journal)}</i>.` : '');
    return { text, html: f.journal ? html : esc(text), complete: false };
  }
  const who = apaAuthors(c.authors);
  const year = `(${c.year ?? 'n.d.'})`;
  const title = c.title ? endDot(c.title) : '[thiếu tên bài].';
  const doi = doiUrl(c.doi);
  let text: string;
  let html: string;
  if (c.type === 'book') {
    text = [who ? `${endDot(who)}` : '', year + '.', title, c.publisher ? endDot(c.publisher) : '', doi].filter(Boolean).join(' ');
    html = [who ? esc(endDot(who)) : '', year + '.', `<i>${esc(title)}</i>`, c.publisher ? esc(endDot(c.publisher)) : '', doi].filter(Boolean).join(' ');
  } else if (c.type === 'book-chapter' || c.type === 'proceedings-article') {
    const inPart = c.container ? `In ${c.container}${pages(c) ? ` (pp. ${pages(c)})` : ''}.` : '';
    text = [who ? endDot(who) : '', year + '.', title, inPart, c.publisher ? endDot(c.publisher) : '', doi].filter(Boolean).join(' ');
    html = [
      who ? esc(endDot(who)) : '',
      year + '.',
      esc(title),
      c.container ? `In <i>${esc(c.container)}</i>${pages(c) ? ` (pp. ${esc(pages(c))})` : ''}.` : '',
      c.publisher ? esc(endDot(c.publisher)) : '',
      doi
    ]
      .filter(Boolean)
      .join(' ');
  } else {
    const vol = c.volume ? `, ${c.volume}${c.issue ? `(${c.issue})` : ''}` : '';
    const pg = pages(c) ? `, ${pages(c)}` : '';
    const src = c.container ? `${c.container}${vol}${pg}.` : '';
    text = [who ? endDot(who) : '', year + '.', title, src, doi].filter(Boolean).join(' ');
    const srcHtml = c.container
      ? `<i>${esc(c.container)}${c.volume ? `, ${esc(c.volume)}` : ''}</i>${c.volume && c.issue ? `(${esc(c.issue)})` : ''}${pg ? esc(pg) : ''}.`
      : '';
    html = [who ? esc(endDot(who)) : '', year + '.', esc(title), srcHtml, doi].filter(Boolean).join(' ');
  }
  if (!who) {
    // APA: không có tác giả → tên bài đứng đầu
    text = text.replace(`${year}. ${title}`, `${title} ${year}.`);
    html = html.replace(`${year}. ${esc(title)}`, `${esc(title)} ${year}.`);
  }
  return { text, html, complete: Boolean(who && c.title && c.year) };
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------- BibTeX ---------------- */

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]/g, '');

const bibEsc = (s: string) => s.replace(/([&%$#_])/g, '\\$1');

export function bibtexKey(input: CiteInput, used: Set<string>): string {
  const c = input.csl;
  const first = c?.authors[0]?.family ?? input.fallback.title.split(/\s+/)[0] ?? 'paper';
  const word = (c?.title ?? input.fallback.title).split(/\s+/).find((w) => w.length > 3) ?? '';
  const base = `${ascii(first).toLowerCase() || 'paper'}${c?.year ?? input.fallback.year ?? ''}${ascii(word).toLowerCase()}`.slice(0, 40);
  let key = base;
  for (let i = 0; used.has(key); i++) key = base + String.fromCharCode(97 + (i % 26)) + (i >= 26 ? i : '');
  used.add(key);
  return key;
}

export function bibtex(input: CiteInput, key: string): string {
  const c = input.csl;
  const f = input.fallback;
  const type = !c ? 'article' : c.type === 'book' ? 'book' : c.type === 'book-chapter' ? 'incollection' : c.type === 'proceedings-article' ? 'inproceedings' : 'article';
  const fields: [string, string | null | undefined][] = [
    ['author', c?.authors.length ? c.authors.map((a) => (a.given ? `${a.family}, ${a.given}` : `{${a.family}}`)).join(' and ') : null],
    ['title', c?.title ?? f.title],
    [type === 'article' ? 'journal' : 'booktitle', c?.container ?? f.journal],
    ['year', String(c?.year ?? f.year ?? '')],
    ['volume', c?.volume],
    ['number', c?.issue],
    ['pages', c?.page ? c.page.replace(/-+/g, '--') : c?.articleNumber],
    ['publisher', c?.publisher ?? f.publisher],
    ['doi', c?.doi ?? f.doi]
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${k === 'title' ? `{${bibEsc(v!)}}` : k === 'doi' ? v : bibEsc(v!)}}`)
    .join(',\n');
  return `@${type}{${key},\n${body}\n}`;
}

/* ---------------- RIS ---------------- */

export function ris(input: CiteInput): string {
  const c = input.csl;
  const f = input.fallback;
  const ty = !c ? 'JOUR' : c.type === 'book' ? 'BOOK' : c.type === 'book-chapter' ? 'CHAP' : c.type === 'proceedings-article' ? 'CPAPER' : 'JOUR';
  const lines: string[] = [`TY  - ${ty}`];
  for (const a of c?.authors ?? []) lines.push(`AU  - ${a.given ? `${a.family}, ${a.given}` : a.family}`);
  lines.push(`TI  - ${c?.title ?? f.title}`);
  const container = c?.container ?? f.journal;
  if (container) lines.push(`${ty === 'JOUR' ? 'JO' : 'T2'}  - ${container}`);
  const year = c?.year ?? f.year;
  if (year) lines.push(`PY  - ${year}`);
  if (c?.volume) lines.push(`VL  - ${c.volume}`);
  if (c?.issue) lines.push(`IS  - ${c.issue}`);
  if (c?.page) {
    const [sp, ep] = c.page.split(/-+/);
    lines.push(`SP  - ${sp}`);
    if (ep) lines.push(`EP  - ${ep}`);
  } else if (c?.articleNumber) lines.push(`SP  - ${c.articleNumber}`);
  const pub = c?.publisher ?? f.publisher;
  if (pub) lines.push(`PB  - ${pub}`);
  const doi = c?.doi ?? f.doi;
  if (doi) lines.push(`DO  - ${doi}`, `UR  - https://doi.org/${doi}`);
  lines.push('ER  - ');
  return lines.join('\r\n');
}

/** Sắp xếp kiểu APA: theo họ tác giả đầu, rồi năm */
export function apaSortKey(input: CiteInput): string {
  const c = input.csl;
  return `${(c?.authors[0]?.family ?? c?.title ?? input.fallback.title).toLowerCase()}|${c?.year ?? input.fallback.year ?? 9999}`;
}

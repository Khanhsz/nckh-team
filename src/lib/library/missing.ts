import type { Paper } from '@/lib/types';
import type { RefItem } from '@/lib/scholar/publication';

/**
 * Bài nền tảng còn thiếu: gom danh mục tham khảo của mọi bài trong thư viện,
 * đếm số bài trong thư viện cùng trích một tài liệu, loại tài liệu nhóm đã có.
 */

export interface RefMeta {
  doi: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  container: string | null;
  issns: string[];
  citedBy: number | null;
}

export interface Suggestion {
  key: string;
  doi: string | null;
  title: string | null;
  authors: string | null;
  year: number | null;
  journal: string | null;
  text: string | null;
  citedBy: number | null;
  issns: string[];
  citing: { id: string; label: string }[];
}

export interface MissingResult {
  suggestions: Suggestion[];
  withRefs: number;
  withDoi: number;
  noRefsDeposited: number;
  totalRefs: number;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'with', 'from', 'by', 'at', 'as', 'its', 'their']);

export const titleWords = (s: string | null | undefined, n = 6) =>
  fold(s ?? '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .slice(0, n)
    .join(' ');

export const surnameOf = (s: string | null | undefined) =>
  fold(s ?? '')
    .replace(/[^a-z\s-]/g, ' ')
    .trim()
    .split(/\s+/)[0] ?? '';

/** Phần tiêu đề trong chuỗi trích dẫn tự do: sau "(2007)." */
const titleFromText = (text: string | null) => {
  if (!text) return null;
  const m = text.match(/\((?:19|20)\d\d[a-z]?\)\.?\s*([^.?!]{8,200})/);
  return m ? m[1] : null;
};

export function refKey(r: RefItem): string | null {
  if (r.doi) return `doi:${r.doi}`;
  const sur = surnameOf(r.author);
  if (!sur || !r.year) return null;
  const tw = titleWords(r.title ?? titleFromText(r.text), 4);
  return tw ? `ay:${sur}|${r.year}|${tw}` : null;
}

/** Bài trong thư viện: DOI, tên bài, và cặp (họ tác giả đầu, năm) lấy từ dữ liệu hoặc tên file "Bakker & Demerouti, 2007.pdf" */
function libraryIndex(papers: Paper[]) {
  const dois = new Set<string>();
  const titles = new Set<string>();
  const authorYear = new Set<string>();
  for (const p of papers) {
    if (p.pub.doi) dois.add(p.pub.doi.toLowerCase());
    if (p.pub.csl?.doi) dois.add(p.pub.csl.doi.toLowerCase());
    const t = titleWords(p.pub.csl?.title, 6);
    if (t) titles.add(t);
    const y = p.pub.csl?.year ?? p.pub.year;
    const a = p.pub.csl?.authors[0]?.family;
    if (a && y) authorYear.add(`${surnameOf(a)}|${y}`);
    const fm = p.fileName.match(/^\s*([^\s,&(]+)[^0-9]*?\b((?:19|20)\d\d)\b/);
    if (fm) authorYear.add(`${surnameOf(fm[1])}|${fm[2]}`);
  }
  return { dois, titles, authorYear };
}

export function findMissing(
  papers: Paper[],
  refsByPaper: Map<string, RefItem[]>,
  meta: Map<string, RefMeta>,
  dismissed: Set<string>,
  minCount = 2
): MissingResult {
  const lib = libraryIndex(papers);
  const groups = new Map<string, { sample: RefItem; citing: Map<string, string> }>();
  let totalRefs = 0;
  let noRefs = 0;

  for (const p of papers) {
    const refs = refsByPaper.get(p.id);
    if (!refs) continue;
    if (refs.length === 0) noRefs++;
    totalRefs += refs.length;
    for (const r of refs) {
      const key = refKey(r);
      if (!key) continue;
      let g = groups.get(key);
      if (!g) {
        g = { sample: r, citing: new Map() };
        groups.set(key, g);
      } else if (!g.sample.title && r.title) g.sample = r;
      g.citing.set(p.id, p.fileName.replace(/\.pdf$/i, ''));
    }
  }

  const inLibrary = (r: RefItem, m: RefMeta | undefined) => {
    if (r.doi && lib.dois.has(r.doi)) return true;
    const t = titleWords(m?.title ?? r.title ?? titleFromText(r.text), 6);
    if (t && lib.titles.has(t)) return true;
    const sur = surnameOf(m?.authors ?? r.author);
    const y = m?.year ?? r.year;
    return Boolean(sur && y && lib.authorYear.has(`${sur}|${y}`));
  };

  const suggestions: Suggestion[] = [];
  for (const [key, g] of groups) {
    if (g.citing.size < minCount || dismissed.has(key)) continue;
    const r = g.sample;
    const m = r.doi ? meta.get(r.doi) : undefined;
    if (inLibrary(r, m)) continue;
    suggestions.push({
      key,
      doi: r.doi,
      title: m?.title ?? r.title ?? titleFromText(r.text),
      authors: m?.authors ?? r.author,
      year: m?.year ?? r.year,
      journal: m?.container ?? r.journal,
      text: r.text,
      citedBy: m?.citedBy ?? null,
      issns: m?.issns ?? [],
      citing: [...g.citing.entries()].map(([id, label]) => ({ id, label }))
    });
  }
  suggestions.sort((a, b) => b.citing.length - a.citing.length || (b.citedBy ?? 0) - (a.citedBy ?? 0) || (a.year ?? 9999) - (b.year ?? 9999));

  return {
    suggestions,
    withRefs: refsByPaper.size,
    withDoi: papers.filter((p) => p.pub.doi).length,
    noRefsDeposited: noRefs,
    totalRefs
  };
}

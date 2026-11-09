import type { Paper, PaperCredibility } from '@/lib/types';

/** Bộ lọc độ tin cậy dùng chung cho trang Thư viện và xuất trích dẫn */
export const REL_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'q12', label: 'Q1–Q2' },
  { id: 'warn', label: '⚠ Cảnh báo / lưu ý' },
  { id: 'none', label: 'Không xếp hạng' }
] as const;
export type RelFilter = (typeof REL_FILTERS)[number]['id'];

export const asRelFilter = (v: string | undefined): RelFilter => REL_FILTERS.find((r) => r.id === v)?.id ?? '';

export function matchesRel(rel: string, c: PaperCredibility | undefined): boolean {
  if (rel === 'q12') return c?.quartile === 'Q1' || c?.quartile === 'Q2';
  if (rel === 'warn') return Boolean(c?.flags.length);
  if (rel === 'none') return !c?.quartile;
  return true;
}

export function filterPapers(papers: Paper[], credMap: Map<string, PaperCredibility>, opts: { rel?: string; q?: string }): Paper[] {
  const query = (opts.q ?? '').trim().toLowerCase();
  const rel = asRelFilter(opts.rel);
  return papers.filter(
    (p) =>
      matchesRel(rel, credMap.get(p.id)) &&
      (!query ||
        p.fileName.toLowerCase().includes(query) ||
        (p.pub.journal ?? '').toLowerCase().includes(query) ||
        Object.values(p.fields).some((v) => v.toLowerCase().includes(query)))
  );
}

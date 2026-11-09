/**
 * Thông tin xuất bản của một bài: chuẩn hoá DOI/ISSN và tra Crossref (miễn phí, không cần khoá).
 * Không bịa: không tìm thấy thì để trống.
 */

export interface PublicationMeta {
  doi: string | null;
  title: string | null;
  journal: string | null;
  issns: string[];
  publisher: string | null;
  year: number | null;
  citedBy: number | null;
  source: 'gemini' | 'crossref' | 'gemini+crossref' | 'none';
}

const UA = 'NCKH-Team/1.0 (+https://nckh-team.vercel.app; research-group literature tool)';

/** "1234-567x" / "1234567X" → "1234567X" ; trả mảng ISSN hợp lệ (có kiểm tra số kiểm) */
export function normalizeIssns(input: string | string[] | null | undefined): string[] {
  const text = Array.isArray(input) ? input.join(' ') : input ?? '';
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/\b(\d{4})[-‐–\s]?(\d{3}[\dX])\b/g)) {
    const issn = m[1] + m[2];
    if (issnChecksumOk(issn)) out.add(issn);
  }
  return [...out].slice(0, 6);
}

function issnChecksumOk(issn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(issn[i]) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  return issn[7] === (check === 10 ? 'X' : String(check));
}

export function normalizeDoi(input: string | null | undefined): string | null {
  const m = (input ?? '').match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  if (!m) return null;
  return m[0].replace(/[.,;:)\]}]+$/, '').toLowerCase();
}

export function parseYear(input: string | number | null | undefined): number | null {
  const m = String(input ?? '').match(/\b(19[5-9]\d|20\d\d)\b/);
  const y = m ? Number(m[1]) : NaN;
  return Number.isFinite(y) && y <= new Date().getFullYear() + 1 ? y : null;
}

const clean = (s: unknown) => (typeof s === 'string' && s.trim() && !/không (đề cập|tìm thấy|có)|not (found|mentioned)|^n\/?a$/i.test(s.trim()) ? s.trim().slice(0, 300) : null);

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  ISSN?: string[];
  'issn-type'?: { value: string; type: string }[];
  publisher?: string;
  issued?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  'is-referenced-by-count'?: number;
  type?: string;
  score?: number;
}

async function crossrefGet(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Dùng RegExp constructor: \p{…} cần ES2018 mà tsconfig đang target ES2017
const NON_WORD = new RegExp('[^\\p{L}\\p{N}\\s]', 'gu');
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(NON_WORD, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** Tỉ lệ từ trong tiêu đề ứng viên xuất hiện trong chuỗi tham chiếu */
function titleCoverage(candidateTitle: string, reference: string): number {
  const ref = new Set(words(reference));
  const cand = words(candidateTitle);
  if (cand.length < 3) return 0;
  return cand.filter((w) => ref.has(w)).length / cand.length;
}

function fromWork(w: CrossrefWork): Omit<PublicationMeta, 'source'> {
  const dp = w.issued?.['date-parts']?.[0] ?? w['published-print']?.['date-parts']?.[0] ?? w['published-online']?.['date-parts']?.[0];
  return {
    doi: normalizeDoi(w.DOI),
    title: w.title?.[0]?.slice(0, 500) ?? null,
    journal: w['container-title']?.[0]?.slice(0, 300) ?? null,
    issns: normalizeIssns([...(w.ISSN ?? []), ...(w['issn-type'] ?? []).map((x) => x.value)]),
    publisher: w.publisher?.slice(0, 300) ?? null,
    year: dp?.[0] ? parseYear(dp[0]) : null,
    citedBy: typeof w['is-referenced-by-count'] === 'number' ? w['is-referenced-by-count'] : null
  };
}

/** Tra Crossref theo DOI, hoặc theo chuỗi trích dẫn (tên bài / thông tin bài) nếu chưa có DOI. */
export async function crossrefLookup(opts: { doi?: string | null; bibliographic?: string | null; title?: string | null }): Promise<Omit<PublicationMeta, 'source'> | null> {
  const doi = normalizeDoi(opts.doi);
  if (doi) {
    const j = (await crossrefGet(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as { message?: CrossrefWork } | null;
    if (j?.message) return fromWork(j.message);
  }
  const ref = [opts.title, opts.bibliographic].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (ref.length < 25) return null;
  const q = new URLSearchParams({
    'query.bibliographic': ref,
    rows: '3',
    select: 'DOI,title,container-title,ISSN,issn-type,publisher,issued,published-print,published-online,is-referenced-by-count,type,score'
  });
  const j = (await crossrefGet(`https://api.crossref.org/works?${q}`)) as { message?: { items?: CrossrefWork[] } } | null;
  const items = j?.message?.items ?? [];
  // Chỉ nhận khi tiêu đề ứng viên khớp chặt với thông tin bài (tránh gán nhầm bài khác)
  const best = items
    .map((w) => ({ w, cov: w.title?.[0] ? titleCoverage(w.title[0], ref) : 0 }))
    .filter((x) => x.cov >= 0.85)
    .sort((a, b) => b.cov - a.cov || (b.w.score ?? 0) - (a.w.score ?? 0))[0];
  return best ? fromWork(best.w) : null;
}

/** Gộp thông tin Gemini đọc được từ PDF với Crossref (Crossref ưu tiên cho DOI/ISSN/trích dẫn). */
export async function resolvePublication(input: {
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  issns?: string[] | string | null;
  publisher?: string | null;
  year?: number | string | null;
  bibliographic?: string | null;
}): Promise<PublicationMeta> {
  const g = {
    doi: normalizeDoi(input.doi),
    title: clean(input.title),
    journal: clean(input.journal),
    issns: normalizeIssns(input.issns ?? null),
    publisher: clean(input.publisher),
    year: parseYear(input.year ?? null)
  };
  const hasGemini = Boolean(g.doi || g.journal || g.issns.length);
  const c = await crossrefLookup({ doi: g.doi, title: g.title, bibliographic: input.bibliographic });
  if (!c) return { ...g, citedBy: null, source: hasGemini ? 'gemini' : 'none' };
  return {
    doi: c.doi ?? g.doi,
    title: c.title ?? g.title,
    journal: c.journal ?? g.journal,
    issns: c.issns.length ? [...new Set([...c.issns, ...g.issns])] : g.issns,
    publisher: c.publisher ?? g.publisher,
    year: c.year ?? g.year,
    citedBy: c.citedBy,
    source: hasGemini ? 'gemini+crossref' : 'crossref'
  };
}

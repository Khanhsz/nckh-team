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
  /** Dữ liệu trích dẫn đầy đủ (tác giả, tập, số, trang) — có khi tra được Crossref */
  csl: CslItem | null;
  source: 'gemini' | 'crossref' | 'gemini+crossref' | 'none';
}

/** Tập con CSL tối thiểu để định dạng APA / BibTeX / RIS */
export interface CslItem {
  type: string;
  title: string | null;
  authors: { family: string; given: string | null }[];
  container: string | null;
  volume: string | null;
  issue: string | null;
  page: string | null;
  articleNumber: string | null;
  year: number | null;
  publisher: string | null;
  doi: string | null;
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
  author?: { family?: string; given?: string; name?: string }[];
  volume?: string;
  issue?: string;
  page?: string;
  'article-number'?: string;
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

async function crossrefGet(url: string, attempt = 0): Promise<unknown | null> {
  try {
    // CROSSREF_MAILTO (tuỳ chọn): email liên hệ để vào "polite pool" của Crossref (ổn định hơn)
    const mailto = process.env.CROSSREF_MAILTO;
    const full = mailto ? `${url}${url.includes('?') ? '&' : '?'}mailto=${encodeURIComponent(mailto)}` : url;
    const res = await fetch(full, { headers: { 'user-agent': UA, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1) ** 2;
      await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
      return crossrefGet(url, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return attempt < 1 ? crossrefGet(url, attempt + 1) : null;
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
  const year = dp?.[0] ? parseYear(dp[0]) : null;
  const doi = normalizeDoi(w.DOI);
  const csl: CslItem = {
    type: w.type ?? 'journal-article',
    title: w.title?.[0]?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? null,
    authors: (w.author ?? [])
      .map((a) => ({ family: (a.family ?? a.name ?? '').trim(), given: a.given?.trim() || null }))
      .filter((a) => a.family)
      .slice(0, 60),
    container: w['container-title']?.[0]?.slice(0, 300) ?? null,
    volume: w.volume?.slice(0, 20) ?? null,
    issue: w.issue?.slice(0, 20) ?? null,
    page: w.page?.slice(0, 30) ?? null,
    articleNumber: w['article-number']?.slice(0, 30) ?? null,
    year,
    publisher: w.publisher?.slice(0, 300) ?? null,
    doi
  };
  return {
    csl,
    doi,
    title: w.title?.[0]?.slice(0, 500) ?? null,
    journal: w['container-title']?.[0]?.slice(0, 300) ?? null,
    issns: normalizeIssns([...(w.ISSN ?? []), ...(w['issn-type'] ?? []).map((x) => x.value)]),
    publisher: w.publisher?.slice(0, 300) ?? null,
    year,
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
    select:
      'DOI,title,author,volume,issue,page,article-number,container-title,ISSN,issn-type,publisher,issued,published-print,published-online,is-referenced-by-count,type,score'
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
/** "Họ, Tên; Họ, Tên" → danh sách tác giả */
export function parseAuthors(s: string | null | undefined): CslItem['authors'] {
  return (s ?? '')
    .split(/;|\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && !/không|not found/i.test(x))
    .slice(0, 60)
    .map((x) => {
      const [family, ...rest] = x.split(',');
      return { family: family.trim(), given: rest.join(',').trim() || null };
    });
}

export async function resolvePublication(input: {
  doi?: string | null;
  title?: string | null;
  authors?: string | null;
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
  if (!c) {
    // Không có Crossref: dựng CSL từ thông tin AI đọc trên PDF (nếu đủ tên bài)
    const authors = parseAuthors(input.authors);
    const csl: CslItem | null = g.title
      ? { type: 'journal-article', title: g.title, authors, container: g.journal, volume: null, issue: null, page: null, articleNumber: null, year: g.year, publisher: g.publisher, doi: g.doi }
      : null;
    return { ...g, citedBy: null, csl, source: hasGemini ? 'gemini' : 'none' };
  }
  return {
    doi: c.doi ?? g.doi,
    title: c.title ?? g.title,
    journal: c.journal ?? g.journal,
    issns: c.issns.length ? [...new Set([...c.issns, ...g.issns])] : g.issns,
    publisher: c.publisher ?? g.publisher,
    year: c.year ?? g.year,
    citedBy: c.citedBy,
    csl: c.csl,
    source: hasGemini ? 'gemini+crossref' : 'crossref'
  };
}

/** Lấy lại bản ghi Crossref đầy đủ theo DOI (dùng khi xuất trích dẫn cho bài cũ chưa có tác giả) */
export async function crossrefByDoi(doi: string): Promise<Omit<PublicationMeta, 'source'> | null> {
  return crossrefLookup({ doi });
}

/** Một mục trong danh mục tài liệu tham khảo (Crossref "reference") */
export interface RefItem {
  doi: string | null;
  title: string | null;
  author: string | null;
  year: number | null;
  journal: string | null;
  text: string | null;
}

interface CrossrefRef {
  DOI?: string;
  'article-title'?: string;
  'volume-title'?: string;
  author?: string;
  year?: string;
  'journal-title'?: string;
  unstructured?: string;
}

/** Danh mục tài liệu tham khảo của một bài theo DOI. null = không tra được; [] = NXB không công bố danh mục. */
export async function crossrefReferences(doi: string): Promise<RefItem[] | null> {
  const d = normalizeDoi(doi);
  if (!d) return null;
  const j = (await crossrefGet(`https://api.crossref.org/works/${encodeURIComponent(d)}`)) as { message?: { reference?: CrossrefRef[] } } | null;
  if (!j?.message) return null;
  return (j.message.reference ?? []).slice(0, 400).map((r) => {
    const text = r.unstructured?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? null;
    return {
      doi: normalizeDoi(r.DOI),
      title: (r['article-title'] ?? r['volume-title'])?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null,
      author: r.author?.trim().slice(0, 100) ?? (text ? text.split(/[,.(]/)[0].trim().slice(0, 100) || null : null),
      year: parseYear(r.year ?? text?.match(/\((19|20)\d\d[a-z]?\)/)?.[0] ?? null),
      journal: r['journal-title']?.trim().slice(0, 200) ?? null,
      text
    };
  });
}

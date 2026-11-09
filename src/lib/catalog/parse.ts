/**
 * Đọc file danh mục tạp chí ngay trên trình duyệt (không tải cả file lên server).
 * - SCImago (SJR): CSV phân cách ";" — https://www.scimagojr.com/journalrank.php → "Download data"
 * - Scopus Source title list: .xlsx (đọc bằng DecompressionStream, không cần thư viện) hoặc .csv
 */

import { normalizeIssns } from '@/lib/scholar/publication';

export interface SjrRow {
  sourceid: number;
  title: string;
  issns: string[];
  sjr: number | null;
  quartile: string | null;
  h_index: number | null;
  categories: string | null;
  publisher: string | null;
  rank_year: number | null;
}

export interface FlagRow {
  kind: 'scopus_discontinued' | 'beall_journal' | 'beall_publisher';
  title: string | null;
  issns: string[];
  publisher: string | null;
  reason: string | null;
  since: string | null;
}

/* ---------------- CSV ---------------- */

export function parseCsv(text: string, delimiter?: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const d = delimiter ?? ([';', ',', '\t'].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const num = (s: string | undefined) => {
  if (!s) return null;
  const v = Number(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** CSV của SCImago → các dòng xếp hạng. Ném lỗi nếu không đúng định dạng. */
export function parseSjrCsv(text: string): { rows: SjrRow[]; year: number | null } {
  const table = parseCsv(text.replace(/^﻿/, ''));
  const header = (table[0] ?? []).map((h) => h.trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iId = col(/^sourceid$/i);
  const iTitle = col(/^title$/i);
  const iIssn = col(/^issn$/i);
  const iSjr = col(/^sjr$/i);
  const iQ = col(/best quartile/i);
  const iH = col(/^h index$/i);
  const iCat = col(/^categories$/i);
  const iPub = col(/^publisher$/i);
  if (iId < 0 || iTitle < 0 || iIssn < 0 || iQ < 0) {
    throw new Error('File không giống CSV của SCImago (thiếu cột Sourceid / Title / Issn / SJR Best Quartile).');
  }
  const yearMatch = header.join(' ').match(/\((\d{4})\)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const rows: SjrRow[] = [];
  for (const r of table.slice(1)) {
    const id = Number(r[iId]);
    const title = r[iTitle]?.trim();
    if (!Number.isFinite(id) || !title) continue;
    const q = r[iQ]?.trim().toUpperCase();
    rows.push({
      sourceid: id,
      title: title.slice(0, 400),
      issns: normalizeIssns(r[iIssn] ?? ''),
      sjr: iSjr >= 0 ? num(r[iSjr]) : null,
      quartile: q === 'Q1' || q === 'Q2' || q === 'Q3' || q === 'Q4' ? q : null,
      h_index: iH >= 0 ? num(r[iH]) : null,
      categories: iCat >= 0 ? r[iCat]?.trim().slice(0, 600) || null : null,
      publisher: iPub >= 0 ? r[iPub]?.trim().slice(0, 300) || null : null,
      rank_year: year
    });
  }
  if (rows.length < 100) throw new Error('File SCImago có quá ít dòng — có thể tải nhầm (chỉ một lĩnh vực?). Hãy tải danh sách đầy đủ "All subject areas".');
  return { rows, year };
}

/* ---------------- XLSX (zip) ---------------- */

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  offset: number;
}

function zipEntries(buf: ArrayBuffer): ZipEntry[] {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('File không phải .xlsx hợp lệ.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.push({ name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function entryStream(buf: ArrayBuffer, e: ZipEntry): ReadableStream<string> {
  const dv = new DataView(buf);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = new Blob([new Uint8Array(buf, start, e.compSize)]).stream();
  const bytes = e.method === 8 ? raw.pipeThrough(new DecompressionStream('deflate-raw')) : raw;
  return bytes.pipeThrough(new TextDecoderStream());
}

async function entryText(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  let s = '';
  const reader = entryStream(buf, e).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    s += value;
  }
  return s;
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const textOf = (xml: string) => unxml([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Duyệt từng dòng của mọi sheet trong file .xlsx (đọc theo luồng, chịu được file lớn). */
export async function readXlsx(
  file: File,
  onSheet: (sheetName: string) => ((cells: string[]) => void) | null,
  onProgress?: (text: string) => void
): Promise<void> {
  const buf = await file.arrayBuffer();
  const entries = zipEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const ssEntry = byName.get('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (ssEntry) {
    onProgress?.('Đang đọc bảng chữ…');
    const xml = await entryText(buf, ssEntry);
    for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }

  const wb = byName.get('xl/workbook.xml');
  const rels = byName.get('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) throw new Error('File .xlsx thiếu thông tin sheet.');
  const wbXml = await entryText(buf, wb);
  const relXml = await entryText(buf, rels);
  const target = new Map([...relXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1] ?? '', m[0].match(/Target="([^"]+)"/)?.[1] ?? '']));
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unxml(m[0].match(/name="([^"]*)"/)?.[1] ?? ''),
    path: (() => {
      const t = target.get(m[0].match(/r:id="([^"]+)"/)?.[1] ?? '') ?? '';
      return t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    })()
  }));

  for (const sh of sheets) {
    const entry = byName.get(sh.path);
    const onRow = entry ? onSheet(sh.name) : null;
    if (!entry || !onRow) continue;
    onProgress?.(`Đang đọc sheet “${sh.name}”…`);
    const reader = entryStream(buf, entry).getReader();
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (value) pending += value;
      const cut = done ? pending.length : pending.lastIndexOf('</row>') + 6;
      if (cut > 5) {
        const chunk = pending.slice(0, cut);
        pending = pending.slice(cut);
        for (const rm of chunk.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
          const cells: string[] = [];
          for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = cm[1];
            const inner = cm[2] ?? '';
            const ref = attrs.match(/\br="([A-Z]+)\d*"/)?.[1];
            const idx = ref ? colIndex(ref) : cells.length;
            const t = attrs.match(/\bt="([^"]+)"/)?.[1];
            let v = '';
            if (t === 'inlineStr') v = textOf(inner);
            else {
              const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
              v = t === 's' ? shared[Number(raw)] ?? '' : unxml(raw);
            }
            cells[idx] = v;
          }
          onRow(Array.from(cells, (c) => c ?? ''));
        }
      }
      if (done) break;
    }
  }
}

/* ---------------- Scopus: tạp chí bị ngừng chỉ mục ---------------- */

interface ScopusCols {
  title: number;
  issn: number;
  eissn: number;
  publisher: number;
  quality: number;
  reason: number;
  since: number;
}

function scopusCols(header: string[]): ScopusCols | null {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = h.findIndex((x) => re.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const title = find(/^source title/, /^title$/, /journal title/, /^source$/);
  const issn = find(/^issn$/, /^print[- ]?issn/, /^p-?issn/);
  if (title < 0 || issn < 0) return null;
  return {
    title,
    issn,
    eissn: find(/^e-?issn/, /electronic issn/),
    publisher: find(/^publisher$/, /publisher's name/, /^publisher/),
    quality: find(/discontinued.*quality/, /quality issues/),
    reason: find(/reason/, /re-?evaluation/),
    since: find(/indexation change/, /^year$/, /discontinu.*(year|date)/)
  };
}

/** Gom các tạp chí bị Scopus loại từ file Source title list (.xlsx) hoặc danh sách Discontinued (.xlsx/.csv). */
export async function parseScopusFile(file: File, onProgress?: (t: string) => void): Promise<FlagRow[]> {
  const out = new Map<string, FlagRow>();
  const add = (cells: string[], c: ScopusCols, allFlagged: boolean) => {
    const title = cells[c.title]?.trim();
    if (!title) return;
    const qualityVal = c.quality >= 0 ? cells[c.quality]?.trim() ?? '' : '';
    if (!allFlagged && (!qualityVal || /^(no|n|false|0|-)$/i.test(qualityVal))) return;
    const issns = normalizeIssns([cells[c.issn] ?? '', c.eissn >= 0 ? cells[c.eissn] ?? '' : '']);
    const reason = (c.reason >= 0 ? cells[c.reason]?.trim() : '') || (allFlagged ? null : 'Vấn đề chất lượng');
    const sinceRaw = allFlagged ? (c.since >= 0 ? cells[c.since]?.trim() ?? '' : '') : qualityVal;
    const since = sinceRaw.match(/(19|20)\d\d/)?.[0] ?? null;
    const key = issns.join(',') || title.toLowerCase();
    out.set(key, {
      kind: 'scopus_discontinued',
      title: title.slice(0, 400),
      issns,
      publisher: c.publisher >= 0 ? cells[c.publisher]?.trim().slice(0, 300) || null : null,
      reason: reason?.slice(0, 300) ?? null,
      since
    });
  };

  const makeHandler = (sheetName: string) => {
    let cols: ScopusCols | null = null;
    let seen = 0;
    const allFlagged = /discontinu/i.test(sheetName);
    return (cells: string[]) => {
      if (!cols) {
        if (++seen > 15) return;
        cols = scopusCols(cells);
        if (cols && !allFlagged && cols.quality < 0) cols = null; // sheet nguồn đầy đủ nhưng không có cột "discontinued" → bỏ
        return;
      }
      add(cells, cols, allFlagged);
    };
  };

  if (/\.csv$/i.test(file.name)) {
    const handler = makeHandler(file.name);
    for (const r of parseCsv((await file.text()).replace(/^﻿/, ''))) handler(r);
  } else {
    await readXlsx(file, (name) => makeHandler(name), onProgress);
  }
  const rows = [...out.values()];
  if (rows.length === 0) {
    throw new Error('Không tìm thấy tạp chí nào bị ngừng chỉ mục trong file. Hãy dùng file "Source title list" (.xlsx) tải từ trang Scopus, hoặc danh sách "Discontinued titles".');
  }
  return rows;
}

/* ---------------- Beall (dán / tải file .txt) ---------------- */

export function parseNameList(text: string, kind: 'beall_journal' | 'beall_publisher'): FlagRow[] {
  const seen = new Set<string>();
  const rows: FlagRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/\([^)]*\)/g, ' ').replace(/^[\s•*\-–\d.]+/, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || name.length > 250) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ kind, title: kind === 'beall_journal' ? name : null, publisher: kind === 'beall_publisher' ? name : null, issns: [], reason: null, since: null });
  }
  return rows;
}

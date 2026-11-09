'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { normalizeIssns } from '@/lib/scholar/publication';
import { parseNameList, type FlagRow, type SjrRow } from './parse';

/**
 * Danh mục tạp chí dùng chung (SCImago, Scopus bị loại, Beall).
 * Quyền ghi kiểm tra bằng RLS: chỉ người là trưởng nhóm của ít nhất một dự án.
 */

export type CatalogKind = 'sjr' | 'scopus_discontinued' | 'beall';
const MAX_BATCH = 1500;

async function catalogEditor() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_any_project_owner');
  return data ? supabase : null;
}

const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

export async function clearCatalogAction(kind: CatalogKind): Promise<{ error?: string }> {
  const supabase = await catalogEditor();
  if (!supabase) return { error: 'Chỉ trưởng nhóm được cập nhật danh mục tạp chí.' };
  const { error } =
    kind === 'sjr'
      ? await supabase.from('journal_ranks').delete().gte('sourceid', 0)
      : kind === 'beall'
        ? await supabase.from('journal_flags').delete().in('kind', ['beall_journal', 'beall_publisher'])
        : await supabase.from('journal_flags').delete().eq('kind', 'scopus_discontinued');
  return error ? { error: dbErrorMessage(error) } : {};
}

export async function insertSjrAction(rows: SjrRow[]): Promise<{ error?: string; inserted?: number }> {
  const supabase = await catalogEditor();
  if (!supabase) return { error: 'Chỉ trưởng nhóm được cập nhật danh mục tạp chí.' };
  if (!Array.isArray(rows) || rows.length > MAX_BATCH) return { error: 'Lô dữ liệu không hợp lệ.' };
  const clean = rows
    .map((r) => ({
      sourceid: int(r.sourceid) ?? -1,
      title: txt(r.title, 400) ?? '',
      issns: normalizeIssns(Array.isArray(r.issns) ? r.issns.map(String) : []),
      sjr: typeof r.sjr === 'number' && Number.isFinite(r.sjr) ? r.sjr : null,
      quartile: r.quartile === 'Q1' || r.quartile === 'Q2' || r.quartile === 'Q3' || r.quartile === 'Q4' ? r.quartile : null,
      h_index: int(r.h_index),
      categories: txt(r.categories, 600),
      publisher: txt(r.publisher, 300),
      rank_year: int(r.rank_year)
    }))
    .filter((r) => r.sourceid > 0 && r.title);
  const { error } = await supabase.from('journal_ranks').upsert(clean, { onConflict: 'sourceid' });
  return error ? { error: dbErrorMessage(error) } : { inserted: clean.length };
}

export async function insertFlagsAction(rows: FlagRow[]): Promise<{ error?: string; inserted?: number }> {
  const supabase = await catalogEditor();
  if (!supabase) return { error: 'Chỉ trưởng nhóm được cập nhật danh mục tạp chí.' };
  if (!Array.isArray(rows) || rows.length > MAX_BATCH) return { error: 'Lô dữ liệu không hợp lệ.' };
  const kinds = ['scopus_discontinued', 'beall_journal', 'beall_publisher'] as const;
  const clean = rows
    .filter((r) => (kinds as readonly string[]).includes(r.kind))
    .map((r) => ({
      kind: r.kind,
      title: txt(r.title, 400),
      issns: normalizeIssns(Array.isArray(r.issns) ? r.issns.map(String) : []),
      publisher: txt(r.publisher, 300),
      reason: txt(r.reason, 300),
      since: txt(r.since, 20)
    }))
    .filter((r) => r.title || r.publisher);
  const { error } = await supabase.from('journal_flags').insert(clean);
  return error ? { error: dbErrorMessage(error) } : { inserted: clean.length };
}

export async function finishCatalogImportAction(): Promise<void> {
  revalidatePath('/', 'layout');
}

/* ---------------- Beall: tải bản lưu trữ beallslist.net ---------------- */

function beallNames(html: string): string {
  const start = Math.max(html.indexOf('entry-content'), html.indexOf('<article'), 0);
  const endA = html.indexOf('</article>', start);
  const body = html.slice(start, endA > start ? endA : undefined);
  return [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;|&rsquo;/g, '’')
        .replace(/&#8211;|&ndash;/g, '–')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ')
    )
    .join('\n');
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'NCKH-Team/1.0 (+https://nckh-team.vercel.app)', accept: 'text/html' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function importBeallFromWebAction(): Promise<{ error?: string; publishers?: number; journals?: number }> {
  const supabase = await catalogEditor();
  if (!supabase) return { error: 'Chỉ trưởng nhóm được cập nhật danh mục tạp chí.' };
  const [pubHtml, jHtml] = await Promise.all([fetchText('https://beallslist.net/'), fetchText('https://beallslist.net/standalone-journals/')]);
  if (!pubHtml || !jHtml) return { error: 'Không tải được beallslist.net lúc này. Bạn có thể dán danh sách thủ công (ô bên dưới).' };
  const publishers = parseNameList(beallNames(pubHtml), 'beall_publisher');
  const journals = parseNameList(beallNames(jHtml), 'beall_journal');
  if (publishers.length < 200 || journals.length < 200) {
    return { error: `Trang beallslist.net đổi cấu trúc (chỉ đọc được ${publishers.length} NXB, ${journals.length} tạp chí). Hãy dán danh sách thủ công.` };
  }
  const cleared = await clearCatalogAction('beall');
  if (cleared.error) return cleared;
  const all = [...publishers, ...journals];
  for (let i = 0; i < all.length; i += 1000) {
    const { error } = await supabase.from('journal_flags').insert(all.slice(i, i + 1000));
    if (error) return { error: dbErrorMessage(error) };
  }
  revalidatePath('/', 'layout');
  return { publishers: publishers.length, journals: journals.length };
}

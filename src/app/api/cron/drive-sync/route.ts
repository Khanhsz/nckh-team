import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { supabaseEnv } from '@/lib/supabase/env';
import { listPdfs } from '@/lib/google/drive';
import { resolvePublication } from '@/lib/scholar/publication';

/**
 * Được pg_cron (Supabase) gọi mỗi 12 giờ (07:17 và 19:17 giờ VN). Quét thư mục Drive của mọi dự án đã kết nối
 * và ghi danh sách PDF qua hàm SECURITY DEFINER có kiểm tra khoá bí mật — không cần service_role key.
 */
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function secretMatches(given: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secretMatches(secret)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { url, key } = supabaseEnv();
  const supabase = createSupabase<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: projects, error } = await supabase.rpc('cron_drive_projects', { p_secret: secret! });
  if (error) return NextResponse.json({ error: 'db' }, { status: 500 });

  const results: { project: string; added?: number; changed?: number; error?: string }[] = [];
  for (const p of projects ?? []) {
    try {
      const files = await listPdfs(p.folder_id);
      const { data, error: applyErr } = await supabase.rpc('cron_apply_drive_listing', {
        p_secret: secret!,
        p_project_id: p.project_id,
        p_files: files.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink, size: f.size === null ? '' : String(f.size) }))
      });
      if (applyErr) throw new Error('db');
      const r = (data ?? {}) as { added?: number; changed?: number };
      results.push({ project: p.project_id, added: r.added, changed: r.changed });
    } catch (e) {
      results.push({ project: p.project_id, error: e instanceof Error ? e.message.slice(0, 200) : 'error' });
    }
  }
  // Tra thông tin xuất bản cho bài mới (Crossref, miễn phí) — giới hạn theo thời gian còn lại
  const started = Date.now();
  let resolved = 0;
  const { data: pending } = await supabase.rpc('cron_papers_needing_meta', { p_secret: secret!, p_limit: 40 });
  for (const p of pending ?? []) {
    if (Date.now() - started > 70_000) break;
    try {
      const meta = await resolvePublication({
        doi: p.doi,
        journal: p.journal,
        issns: p.issns,
        title: p.info ? null : p.file_name.replace(/\.pdf$/i, '').replace(/_+/g, ' '),
        bibliographic: p.info
      });
      await supabase.rpc('cron_set_paper_meta', {
        p_secret: secret!,
        p_id: p.id,
        p_meta: meta as unknown as Json
      });
      resolved++;
    } catch {
      /* bỏ qua, lần sau thử lại */
    }
  }
  return NextResponse.json({ ok: true, projects: results.length, results, resolved });
}

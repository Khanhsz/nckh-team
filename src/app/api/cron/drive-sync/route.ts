import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { supabaseEnv } from '@/lib/supabase/env';
import { listPdfs } from '@/lib/google/drive';

/**
 * Được pg_cron (Supabase) gọi mỗi 5 phút. Quét thư mục Drive của mọi dự án đã kết nối
 * và ghi danh sách PDF qua hàm SECURITY DEFINER có kiểm tra khoá bí mật — không cần service_role key.
 */
export const maxDuration = 60;
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
  return NextResponse.json({ ok: true, projects: results.length, results });
}

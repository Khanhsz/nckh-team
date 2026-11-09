import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { supabaseEnv } from '@/lib/supabase/env';
import { getSiteUrl } from '@/lib/site';

/**
 * Lịch ICS riêng từng người (Google Calendar / Apple / Outlook "đăng ký theo URL").
 * Token 64 ký tự ngẫu nhiên là chìa khoá — không cần đăng nhập. Đổi link = token cũ hết hiệu lực.
 * Mỗi việc chưa xong → 1 sự kiện cả ngày vào NGÀY HẠN (kèm nhắc trước 1 ngày); mỗi mốc → 1 sự kiện.
 */
export const dynamic = 'force-dynamic';

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Gập dòng 75 octet theo RFC 5545 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const STATUS: Record<string, string> = { todo: 'Chưa làm', doing: 'Đang làm', review: 'Chờ duyệt', done: 'Hoàn thành' };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, '');
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse('Not found', { status: 404 });

  const { url, key } = supabaseEnv();
  const supabase = createSupabase<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('calendar_feed', { p_token: token });
  if (error) return new NextResponse('Error', { status: 500 });
  if (!data) return new NextResponse('Not found', { status: 404 });

  const site = await getSiteUrl().catch(() => 'https://nckh-team.vercel.app');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NCKH Team//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:NCKH — hạn công việc',
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H'
  ];
  for (const r of data) {
    const proj = r.project_code || r.project_name;
    const isTask = r.kind === 'task';
    const summary = isTask ? `⏰ ${r.is_team ? '👥 ' : ''}${r.title} [${proj}]` : `◆ Mốc: ${r.title} [${proj}]`;
    const desc = isTask
      ? `Dự án: ${r.project_name}\nThời gian: ${r.start_date} → ${r.due_date}\nTrạng thái: ${STATUS[r.status ?? ''] ?? r.status} · ${r.progress ?? 0}%\n${site}/today`
      : `Mốc của dự án ${r.project_name}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.kind}-${r.id}@nckh-team`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(r.due_date)}`,
      `DTEND;VALUE=DATE:${nextDay(r.due_date)}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      'TRANSP:TRANSPARENT'
    );
    if (isTask) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(`Ngày mai đến hạn: ${r.title}`)}`), 'TRIGGER:-PT15H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'inline; filename="nckh.ics"' }
  });
}

import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { supabaseEnv } from '@/lib/supabase/env';
import { sendMails, smtpConfigured, type Mail } from '@/lib/mail/smtp';

/**
 * Email tóm tắt hằng ngày (pg_cron gọi lúc ~07:03 giờ VN): việc trễ hạn, việc đến hạn trong 2 ngày,
 * và việc chờ duyệt (cho trưởng nhóm). Không cấu hình SMTP → bỏ qua, không đánh dấu đã gửi.
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

interface Item {
  kind: 'overdue' | 'soon' | 'review';
  title: string;
  due: string;
  status: string;
  progress: number;
  project: string;
  projectId: string;
}

const vnDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildMail(name: string, items: Item[], site: string): Omit<Mail, 'to'> {
  const groups: [Item['kind'], string, string][] = [
    ['overdue', '⚠ Đã quá hạn', '#be123c'],
    ['soon', '⏰ Đến hạn trong 2 ngày', '#b45309'],
    ['review', '⏳ Chờ bạn duyệt', '#1d4ed8']
  ];
  const late = items.filter((i) => i.kind === 'overdue').length;
  const subject = late ? `[NCKH] ${late} việc quá hạn, ${items.length - late} việc cần chú ý` : `[NCKH] ${items.length} việc cần chú ý hôm nay`;
  const text = [
    `Chào ${name},`,
    '',
    ...groups.flatMap(([k, label]) => {
      const g = items.filter((i) => i.kind === k);
      return g.length ? [label, ...g.map((i) => `  • [${i.project}] ${i.title} — hạn ${vnDate(i.due)}${k !== 'review' ? ` (${i.progress}%)` : ''}`), ''] : [];
    }),
    `Mở app: ${site}/today`,
    '',
    'Tắt email này: vào trang Hôm nay → Nhắc hạn.'
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#18181b;max-width:560px">
<p>Chào ${escHtml(name)},</p>
${groups
  .map(([k, label, color]) => {
    const g = items.filter((i) => i.kind === k);
    if (!g.length) return '';
    return `<p style="margin:16px 0 6px;font-weight:600;color:${color}">${label} (${g.length})</p><ul style="margin:0;padding-left:18px">${g
      .map(
        (i) =>
          `<li style="margin:3px 0"><span style="color:#71717a">[${escHtml(i.project)}]</span> <a href="${site}/projects/${i.projectId}/tasks" style="color:#18181b">${escHtml(i.title)}</a> — hạn <b>${vnDate(i.due)}</b>${k !== 'review' ? ` · ${i.progress}%` : ''}</li>`
      )
      .join('')}</ul>`;
  })
  .join('')}
<p style="margin-top:20px"><a href="${site}/today" style="background:#18181b;color:#fff;padding:8px 14px;text-decoration:none">Mở trang Hôm nay</a></p>
<p style="margin-top:20px;font-size:12px;color:#a1a1aa">Tắt email này: trang Hôm nay → Nhắc hạn.</p></div>`;
  return { subject, text, html };
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secretMatches(secret)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!smtpConfigured()) return NextResponse.json({ ok: true, skipped: 'smtp_not_configured' });

  const { url, key } = supabaseEnv();
  const supabase = createSupabase<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày theo giờ VN
  const { data, error } = await supabase.rpc('cron_digest', { p_secret: secret!, p_today: today });
  if (error) return NextResponse.json({ error: 'db' }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://nckh-team.vercel.app';
  const mails: Mail[] = (data ?? [])
    .filter((r) => r.email && Array.isArray(r.items) && r.items.length)
    .map((r) => ({ to: r.email!, ...buildMail(r.display_name ?? 'bạn', r.items as unknown as Item[], site) }));
  const result = mails.length ? await sendMails(mails) : { sent: 0, errors: [] };
  return NextResponse.json({ ok: true, recipients: mails.length, ...result });
}

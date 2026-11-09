'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getSiteUrl } from '@/lib/site';
import { dbErrorMessage } from '@/lib/errors';
import { explainSmtpError, sendMails, smtpConfigured } from '@/lib/mail/smtp';

/** Tạo (hoặc đổi) link lịch ICS riêng — link cũ hết hiệu lực ngay */
export async function rotateCalendarTokenAction(): Promise<{ url?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rotate_calendar_token');
  if (error || !data) return { error: dbErrorMessage(error, 'Không tạo được link lịch.') };
  revalidatePath('/today');
  return { url: `${await getSiteUrl()}/api/calendar/${data}.ics` };
}

export async function setDigestAction(enabled: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('user_notify').upsert({ user_id: user.id, digest_email: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath('/today');
  return {};
}

/** Gửi một email thử về chính mình để kiểm tra cấu hình SMTP */
export async function sendTestMailAction(): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser();
  if (!smtpConfigured()) return { error: 'Chưa có SMTP_USER / SMTP_PASS trên Vercel (hoặc chưa deploy lại sau khi thêm).' };
  const to = user.email;
  if (!to) return { error: 'Tài khoản của bạn chưa có email.' };
  const site = await getSiteUrl().catch(() => 'https://nckh-team.vercel.app');
  const res = await sendMails([
    {
      to,
      subject: 'NCKH Team: email thử',
      text: `Email gửi thành công. Từ giờ app gửi được thư mời họp, tóm tắt mỗi sáng và thông báo trao quyền.\n${site}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1f1f1f"><p>Email gửi thành công.</p><p>Từ giờ app gửi được thư mời họp, tóm tắt mỗi sáng và thông báo trao quyền.</p><p><a href="${site}" style="color:#0b57d0">${site}</a></p></div>`
    }
  ]);
  if (res.sent) return { ok: `Đã gửi tới ${to}. Kiểm tra hộp thư (và mục Spam).` };
  return { error: explainSmtpError(res.errors[0] ?? 'Không rõ lỗi') };
}

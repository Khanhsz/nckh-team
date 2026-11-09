'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { isValidISODate } from '@/lib/dates';
import { getSiteUrl } from '@/lib/site';
import { getProjectForUser, listMembers } from '@/lib/data/queries';
import { sendMails, smtpConfigured } from '@/lib/mail/smtp';
import { meetingMail } from '@/lib/mail/templates';
import { googleCalendarLink, meetingIcs } from '@/lib/calendar/ics';
import type { Database } from '@/lib/supabase/database.types';

type Row = Database['public']['Tables']['meetings']['Row'];

export interface MeetingInput {
  title: string;
  /** YYYY-MM-DD theo giờ Việt Nam */
  date: string;
  /** HH:MM */
  start: string;
  end: string;
  location: string;
  meetUrl: string;
  notes: string;
  attendeeIds: string[];
  guestEmails: string[];
}

export interface MeetingResult {
  error?: string;
  id?: string;
  /** Kết quả gửi email: sent = số thư đã gửi; skipped = chưa cấu hình SMTP */
  mail?: { sent: number; failed: number; skipped: boolean };
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 14:00 thứ Ba 10/11/2026 → "Thứ Ba, 10/11/2026, 14:00–15:30 (giờ Việt Nam)" */
function whenText(startsAt: string, endsAt: string) {
  const tz = 'Asia/Ho_Chi_Minh';
  const day = new Intl.DateTimeFormat('vi-VN', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(startsAt));
  const t = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${t(startsAt)}–${t(endsAt)}`;
}

async function notify(
  projectId: string,
  m: Row,
  recipients: { email: string; name: string }[],
  kind: 'new' | 'update' | 'cancel',
  byName: string,
  projectName: string
): Promise<MeetingResult['mail']> {
  if (!recipients.length) return { sent: 0, failed: 0, skipped: false };
  if (!smtpConfigured()) return { sent: 0, failed: 0, skipped: true };
  const site = await getSiteUrl().catch(() => 'https://nckh-team.vercel.app');
  const appLink = `${site}/projects/${projectId}/gantt?meeting=${m.id}`;
  const description = [m.notes ?? '', `Dự án: ${projectName}`, `Người tạo: ${byName}`, appLink].filter(Boolean).join('\n\n');
  const ics = meetingIcs({
    id: m.id,
    sequence: m.sequence,
    title: m.title,
    startsAt: m.starts_at,
    endsAt: m.ends_at,
    location: m.location,
    meetUrl: m.meet_url,
    description,
    organizerEmail: process.env.SMTP_USER!,
    organizerName: `${byName} (NCKH Team)`,
    attendees: recipients,
    method: kind === 'cancel' ? 'CANCEL' : 'REQUEST'
  });
  const googleLink = googleCalendarLink({ title: m.title, startsAt: m.starts_at, endsAt: m.ends_at, location: m.location, meetUrl: m.meet_url, details: description });
  const res = await sendMails(
    recipients.map((r) =>
      meetingMail({
        to: r.email,
        toName: r.name,
        kind,
        byName,
        project: projectName,
        title: m.title,
        when: whenText(m.starts_at, m.ends_at),
        location: m.location,
        meetUrl: m.meet_url,
        notes: m.notes,
        googleLink,
        appLink,
        ics
      })
    )
  );
  return { sent: res.sent, failed: recipients.length - res.sent, skipped: false };
}

function recipientsOf(row: Pick<Row, 'attendee_ids' | 'guest_emails'>, members: Awaited<ReturnType<typeof listMembers>>) {
  const out = new Map<string, { email: string; name: string }>();
  for (const id of row.attendee_ids) {
    const mem = members.find((x) => x.userId === id);
    if (mem?.email) out.set(mem.email.toLowerCase(), { email: mem.email, name: mem.displayName });
  }
  for (const e of row.guest_emails) if (!out.has(e.toLowerCase())) out.set(e.toLowerCase(), { email: e, name: e.split('@')[0] });
  return out;
}

export async function saveMeetingAction(projectId: string, meetingId: string | null, input: MeetingInput, sendEmail: boolean): Promise<MeetingResult> {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { error: 'Không tìm thấy dự án.' };

  const title = input.title.trim();
  if (!title) return { error: 'Nhập tên cuộc họp.' };
  if (title.length > 200) return { error: 'Tên cuộc họp tối đa 200 ký tự.' };
  if (!isValidISODate(input.date)) return { error: 'Ngày họp không hợp lệ.' };
  if (!TIME.test(input.start) || !TIME.test(input.end)) return { error: 'Giờ họp không hợp lệ.' };
  if (input.end <= input.start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  const meetUrl = input.meetUrl.trim();
  if (meetUrl && !/^https:\/\/\S+$/i.test(meetUrl)) return { error: 'Link họp cần bắt đầu bằng https://' };
  const guests = [...new Set(input.guestEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = guests.find((e) => !EMAIL.test(e));
  if (bad) return { error: `Email không hợp lệ: ${bad}` };
  if (guests.length > 20) return { error: 'Tối đa 20 khách mời ngoài nhóm.' };

  const members = await listMembers(projectId);
  const attendeeIds = [...new Set(input.attendeeIds)].filter((id) => members.some((m) => m.userId === id));
  const fields = {
    title,
    starts_at: new Date(`${input.date}T${input.start}:00+07:00`).toISOString(),
    ends_at: new Date(`${input.date}T${input.end}:00+07:00`).toISOString(),
    location: input.location.trim().slice(0, 300) || null,
    meet_url: meetUrl || null,
    notes: input.notes.trim().slice(0, 4000) || null,
    attendee_ids: attendeeIds,
    guest_emails: guests
  };

  const supabase = await createClient();
  let row: Row;
  let before: Row | null = null;
  if (meetingId) {
    const { data: old } = await supabase.from('meetings').select('*').eq('id', meetingId).eq('project_id', projectId).maybeSingle();
    if (!old) return { error: 'Không tìm thấy cuộc họp.' };
    before = old;
    const { data, error } = await supabase.from('meetings').update(fields).eq('id', meetingId).select('*');
    if (error) return { error: dbErrorMessage(error) };
    if (!data?.length) return { error: 'Chỉ người tạo cuộc họp hoặc trưởng nhóm được sửa.' };
    row = data[0];
  } else {
    const { data, error } = await supabase
      .from('meetings')
      .insert({ ...fields, project_id: projectId })
      .select('*')
      .single();
    if (error) return { error: error.code === '42501' ? 'Người xem không tạo được cuộc họp.' : dbErrorMessage(error) };
    row = data;
  }
  revalidatePath(`/projects/${projectId}`, 'layout');

  let mail: MeetingResult['mail'];
  if (sendEmail) {
    const byName = members.find((m) => m.userId === user.id)?.displayName ?? 'Thành viên';
    const now = recipientsOf(row, members);
    if (!before) {
      mail = await notify(projectId, row, [...now.values()], 'new', byName, project.name);
    } else {
      const old = recipientsOf(before, members);
      const removed = [...old.entries()].filter(([k]) => !now.has(k)).map(([, v]) => v);
      const added = [...now.entries()].filter(([k]) => !old.has(k)).map(([, v]) => v);
      const changed = row.sequence !== before.sequence;
      // Người mới: thư mời; người cũ: thư cập nhật (chỉ khi giờ/địa điểm/nội dung đổi); người bị bỏ: thư huỷ
      const stay = [...now.entries()].filter(([k]) => old.has(k)).map(([, v]) => v);
      const parts = await Promise.all([
        notify(projectId, row, added, 'new', byName, project.name),
        changed ? notify(projectId, row, stay, 'update', byName, project.name) : Promise.resolve({ sent: 0, failed: 0, skipped: false }),
        notify(projectId, { ...row, sequence: row.sequence + 1 }, removed, 'cancel', byName, project.name)
      ]);
      mail = parts.reduce((a, b) => ({ sent: a!.sent + b!.sent, failed: a!.failed + b!.failed, skipped: a!.skipped || b!.skipped }), { sent: 0, failed: 0, skipped: false });
    }
  }
  return { id: row.id, mail };
}

export async function deleteMeetingAction(projectId: string, meetingId: string, sendEmail: boolean): Promise<MeetingResult> {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { error: 'Không tìm thấy dự án.' };
  const supabase = await createClient();
  const { data: old } = await supabase.from('meetings').select('*').eq('id', meetingId).eq('project_id', projectId).maybeSingle();
  if (!old) return { error: 'Không tìm thấy cuộc họp.' };
  const { data, error } = await supabase.from('meetings').delete().eq('id', meetingId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ người tạo cuộc họp hoặc trưởng nhóm được huỷ.' };
  revalidatePath(`/projects/${projectId}`, 'layout');
  let mail: MeetingResult['mail'];
  if (sendEmail && new Date(old.ends_at) > new Date()) {
    const members = await listMembers(projectId);
    const byName = members.find((m) => m.userId === user.id)?.displayName ?? 'Thành viên';
    mail = await notify(projectId, { ...old, sequence: old.sequence + 1 }, [...recipientsOf(old, members).values()], 'cancel', byName, project.name);
  }
  return { mail };
}

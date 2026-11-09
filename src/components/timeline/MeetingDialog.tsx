'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Meeting, Member, ProjectRole } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { googleCalendarLink } from '@/lib/calendar/ics';
import { deleteMeetingAction, saveMeetingAction, type MeetingResult } from '@/app/(app)/projects/[id]/meetings/actions';

const field = 'w-full border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:bg-paper-2 disabled:text-ink-3';
const label = 'mb-1 block text-xs font-medium text-ink-2';
const TZ = 'Asia/Ho_Chi_Minh';
const STALE = 'Không lưu được: trang đang mở là bản cũ của ứng dụng (vừa cập nhật). Tải lại trang (Ctrl+Shift+R) rồi thử lại.';

/** ISO → { date: YYYY-MM-DD, time: HH:MM } theo giờ Việt Nam */
export function vnParts(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { date, time };
}

const addMinutes = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + n));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const minutesBetween = (a: string, b: string) => {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
};

export function MeetingDialog({
  projectId,
  members,
  userId,
  role,
  meeting,
  defaultDate,
  smtpReady,
  onClose,
  onDone
}: {
  projectId: string;
  members: Member[];
  userId: string;
  role: ProjectRole;
  meeting: Meeting | null;
  defaultDate: string;
  smtpReady: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const canEdit = meeting ? role === 'owner' || (role === 'editor' && meeting.createdBy === userId) : role !== 'viewer';
  const s0 = meeting ? vnParts(meeting.startsAt) : null;
  const e0 = meeting ? vnParts(meeting.endsAt) : null;

  const [title, setTitle] = useState(meeting?.title ?? 'Họp nhóm');
  const [date, setDate] = useState(s0?.date ?? defaultDate);
  const [start, setStart] = useState(s0?.time ?? '14:00');
  const [end, setEnd] = useState(e0?.time ?? '15:00');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [meetUrl, setMeetUrl] = useState(meeting?.meetUrl ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [attendees, setAttendees] = useState<string[]>(meeting?.attendeeIds ?? members.map((m) => m.userId));
  const [guests, setGuests] = useState<string[]>(meeting?.guestEmails ?? []);
  const [guestDraft, setGuestDraft] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, start_] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (canEdit && !meeting) titleRef.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, meeting, onClose]);

  const startsAt = `${date}T${start}:00+07:00`;
  const endsAt = `${date}T${end}:00+07:00`;
  const gLink = useMemo(
    () =>
      date && start && end && end > start
        ? googleCalendarLink({ title: title || 'Họp nhóm', startsAt, endsAt, location: location || null, meetUrl: meetUrl || null, details: notes })
        : null,
    [date, start, end, title, startsAt, endsAt, location, meetUrl, notes]
  );

  const allChecked = attendees.length === members.length;
  const toggle = (id: string) => setAttendees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const addGuest = (raw: string) => {
    const list = raw
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!list.length) return;
    setGuests((g) => [...new Set([...g, ...list])]);
    setGuestDraft('');
  };
  const recipientCount =
    members.filter((m) => attendees.includes(m.userId) && m.email).length + guests.filter((g) => !members.some((m) => m.email?.toLowerCase() === g)).length;

  const mailNote = (r: MeetingResult) => {
    if (!r.mail) return '';
    if (r.mail.skipped) return ' Chưa gửi email vì chưa cấu hình SMTP.';
    if (r.mail.sent === 0 && r.mail.failed === 0) return '';
    return r.mail.failed
      ? ` Đã gửi ${r.mail.sent} email, ${r.mail.failed} email không gửi được${r.mail.error ? `: ${r.mail.error}` : '.'}`
      : ` Đã gửi ${r.mail.sent} email mời kèm lịch.`;
  };

  const save = () =>
    start_(async () => {
      setError(null);
      const pending = guestDraft.trim() ? [...guests, ...guestDraft.split(/[\s,;]+/).filter(Boolean)] : guests;
      let r: MeetingResult;
      try {
        r = await saveMeetingAction(
          projectId,
          meeting?.id ?? null,
          { title, date, start, end, location, meetUrl, notes, attendeeIds: attendees, guestEmails: pending },
          sendEmail
        );
      } catch {
        return setError(STALE);
      }
      if (r.error) return setError(r.error);
      if (r.mail?.failed && r.mail.sent === 0) {
        // Đã lưu cuộc họp nhưng không gửi được thư nào: giữ hộp thoại để người dùng thấy lỗi
        return setError(`Đã lưu cuộc họp nhưng chưa gửi được email. ${r.mail.error ?? ''}`.trim());
      }
      onDone(`${meeting ? 'Đã lưu' : 'Đã đặt'} cuộc họp “${title.trim()}”.${mailNote(r)}`);
    });

  const remove = () => {
    if (!meeting) return;
    if (!window.confirm(`Huỷ cuộc họp “${meeting.title}”?${sendEmail && smtpReady ? ' Người tham dự sẽ nhận email báo huỷ.' : ''}`)) return;
    start_(async () => {
      let r: MeetingResult;
      try {
        r = await deleteMeetingAction(projectId, meeting.id, sendEmail);
      } catch {
        return setError(STALE);
      }
      if (r.error) return setError(r.error);
      onDone(`Đã huỷ cuộc họp “${meeting.title}”.${mailNote(r)}`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={meeting ? 'Chi tiết cuộc họp' : 'Đặt lịch họp'}
        className="flex max-h-[calc(100vh-32px)] w-full max-w-xl flex-col rounded-[28px] bg-white shadow-[0_8px_28px_rgba(60,64,67,.28)]"
      >
        <div className="flex items-center gap-2 px-6 pb-2 pt-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3e1fa] text-[#8e24aa]">
            <Icon name="calendar" size={17} />
          </span>
          <h2 className="text-[18px] font-normal">{meeting ? (canEdit ? 'Sửa cuộc họp' : 'Cuộc họp') : 'Đặt lịch họp'}</h2>
          <button onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2" aria-label="Đóng">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="thin-scroll space-y-4 overflow-y-auto px-6 pb-4 pt-1">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            maxLength={200}
            aria-label="Tên cuộc họp"
            placeholder="Thêm tiêu đề"
            className="w-full border-0 border-b border-line bg-transparent px-0 pb-1.5 text-[22px] outline-none focus:border-primary disabled:text-ink"
          />

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className={label} htmlFor="mt-date">Ngày</label>
              <input id="mt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="mt-start">Từ</label>
              <input
                id="mt-start"
                type="time"
                step={300}
                value={start}
                onChange={(e) => {
                  const dur = Math.max(15, minutesBetween(start, end));
                  setStart(e.target.value);
                  if (e.target.value) setEnd(addMinutes(e.target.value, dur));
                }}
                disabled={!canEdit}
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="mt-end">Đến</label>
              <input id="mt-end" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit} className={field} />
            </div>
            <span className="pb-2 text-xs text-ink-3">giờ Việt Nam</span>
          </div>
          {end <= start && <p className="-mt-2 text-xs text-[#d93025]">Giờ kết thúc phải sau giờ bắt đầu.</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="mt-loc">Địa điểm</label>
              <input id="mt-loc" value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canEdit} maxLength={300} placeholder="vd. Phòng B201, thư viện" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="mt-url">
                Link họp online
                {canEdit && (
                  <a href="https://meet.google.com/new" target="_blank" rel="noreferrer" className="ml-2 font-normal text-primary hover:underline">
                    Tạo link Google Meet
                  </a>
                )}
              </label>
              {canEdit ? (
                <input id="mt-url" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} maxLength={500} placeholder="https://meet.google.com/…" className={field} />
              ) : meetUrl ? (
                <a href={meetUrl} target="_blank" rel="noreferrer" className="block truncate py-1.5 text-sm text-primary hover:underline">
                  {meetUrl}
                </a>
              ) : (
                <p className="py-1.5 text-sm text-ink-3">Không có</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-ink-2">Người tham dự ({attendees.length})</span>
              {canEdit && (
                <button onClick={() => setAttendees(allChecked ? [] : members.map((m) => m.userId))} className="text-xs text-primary hover:underline">
                  {allChecked ? 'Bỏ chọn tất cả' : 'Chọn cả nhóm'}
                </button>
              )}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = attendees.includes(m.userId);
                return (
                  <li key={m.userId}>
                    <button
                      onClick={() => canEdit && toggle(m.userId)}
                      disabled={!canEdit}
                      aria-pressed={on}
                      title={m.email ?? 'Chưa có email'}
                      className={`flex items-center gap-1.5 border py-1 pl-1.5 pr-3 text-[13px] ${
                        on ? 'border-transparent bg-primary-container text-on-primary-container' : 'border-line text-ink-2 hover:bg-paper-2'
                      } disabled:cursor-default`}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${on ? 'bg-primary text-white' : 'bg-paper-2 text-ink-2'}`}>
                        {on ? <Icon name="check" size={12} strokeWidth={2.5} /> : m.displayName.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                      </span>
                      {m.displayName}
                      {m.role === 'viewer' && <span className="text-[11px] opacity-70">GVHD</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label className={label} htmlFor="mt-guest">Khách mời ngoài nhóm (email)</label>
            <div className="flex flex-wrap items-center gap-1.5 border border-line px-2 py-1.5 focus-within:border-primary">
              {guests.map((g) => (
                <span key={g} className="flex items-center gap-1 rounded-full bg-paper-2 py-0.5 pl-2.5 pr-1 text-[13px] text-ink-2">
                  {g}
                  {canEdit && (
                    <button onClick={() => setGuests((x) => x.filter((y) => y !== g))} className="flex h-5 w-5 items-center justify-center hover:bg-line" aria-label={`Bỏ ${g}`}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <input
                  id="mt-guest"
                  value={guestDraft}
                  onChange={(e) => setGuestDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault();
                      addGuest(guestDraft);
                    } else if (e.key === 'Backspace' && !guestDraft && guests.length) setGuests((x) => x.slice(0, -1));
                  }}
                  onBlur={() => addGuest(guestDraft)}
                  placeholder={guests.length ? '' : 'vd. thầy cô hướng dẫn chưa có tài khoản'}
                  className="min-w-40 flex-1 border-0 py-0.5 text-sm outline-none"
                />
              )}
              {!canEdit && !guests.length && <span className="text-sm text-ink-3">Không có</span>}
            </div>
          </div>

          <div>
            <label className={label} htmlFor="mt-notes">Nội dung / chương trình họp</label>
            <textarea id="mt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} rows={3} maxLength={4000} className={field} />
          </div>

          {canEdit && (
            <label className="flex items-start gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="mt-0.5" />
              <span>
                {meeting ? 'Gửi email cập nhật cho người tham dự' : 'Gửi email mời kèm lịch'} ({recipientCount} người)
                <span className="block text-xs text-ink-3">
                  {smtpReady
                    ? 'Thư có thẻ sự kiện để thêm vào Google Calendar / Outlook, kèm tệp .ics.'
                    : 'Chưa cấu hình email (SMTP_USER, SMTP_PASS trên Vercel) nên sẽ chưa gửi được. Vẫn có thể dùng nút Thêm vào Google Calendar.'}
                </span>
              </span>
            </label>
          )}
          {error && <p className="text-sm text-[#d93025]">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-3">
          {gLink && (
            <a href={gLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary-container/50">
              <Icon name="calendar" size={16} />
              Thêm vào Google Calendar
            </a>
          )}
          {meeting && (
            <a href={`/api/projects/${projectId}/meetings/${meeting.id}/ics`} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-2 hover:bg-paper-2">
              <Icon name="download" size={16} />
              Tệp .ics
            </a>
          )}
          <div className="ml-auto flex gap-2">
            {meeting && canEdit && (
              <button onClick={remove} disabled={busy} className="px-4 py-2 text-sm text-[#d93025] hover:bg-[#fce8e6]">
                Huỷ họp
              </button>
            )}
            {canEdit ? (
              <button onClick={save} disabled={busy || end <= start || !title.trim()} className="bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40">
                {busy ? 'Đang lưu…' : 'Lưu'}
              </button>
            ) : (
              <button onClick={onClose} className="border border-ink-3/50 px-5 py-2 text-sm text-primary hover:bg-paper-2">
                Đóng
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

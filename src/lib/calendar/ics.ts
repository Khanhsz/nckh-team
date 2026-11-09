/** Tiện ích iCalendar (RFC 5545) dùng chung cho lời mời họp và lịch đăng ký */

export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Giá trị tham số CN: đặt trong ngoặc kép, bỏ ký tự không hợp lệ */
const cn = (s: string) => `"${s.replace(/["\r\n]/g, '')}"`;

/** Gập dòng 75 octet */
export function icsFold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
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

/** 2026-11-10T07:00:00.000Z → 20261110T070000Z */
export const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface MeetingIcsInput {
  id: string;
  sequence: number;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetUrl: string | null;
  description: string;
  organizerEmail: string;
  organizerName: string;
  attendees: { email: string; name?: string }[];
  method: 'REQUEST' | 'CANCEL' | 'PUBLISH';
}

export function meetingIcs(m: MeetingIcsInput): string {
  const loc = [m.location, m.meetUrl].filter(Boolean).join(' · ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NCKH Team//VI',
    'CALSCALE:GREGORIAN',
    `METHOD:${m.method}`,
    'BEGIN:VEVENT',
    `UID:meeting-${m.id}@nckh-team`,
    `SEQUENCE:${m.sequence}`,
    `DTSTAMP:${icsUtc(new Date().toISOString())}`,
    `DTSTART:${icsUtc(m.startsAt)}`,
    `DTEND:${icsUtc(m.endsAt)}`,
    icsFold(`SUMMARY:${icsEscape(m.title)}`),
    icsFold(`DESCRIPTION:${icsEscape(m.description)}`),
    ...(loc ? [icsFold(`LOCATION:${icsEscape(loc)}`)] : []),
    ...(m.meetUrl ? [icsFold(`URL:${m.meetUrl}`)] : []),
    icsFold(`ORGANIZER;CN=${cn(m.organizerName)}:mailto:${m.organizerEmail}`),
    ...m.attendees.map((a) =>
      icsFold(`ATTENDEE;${a.name ? `CN=${cn(a.name)};` : ''}ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a.email}`)
    ),
    `STATUS:${m.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(m.method === 'CANCEL' ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', icsFold(`DESCRIPTION:${icsEscape(m.title)}`), 'TRIGGER:-PT30M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Link "Thêm vào Google Calendar" (không cần đăng nhập app, không cần email) */
export function googleCalendarLink(m: { title: string; startsAt: string; endsAt: string; location: string | null; meetUrl: string | null; details: string }): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: m.title,
    dates: `${icsUtc(m.startsAt)}/${icsUtc(m.endsAt)}`,
    details: [m.meetUrl ? `Link họp: ${m.meetUrl}` : '', m.details].filter(Boolean).join('\n\n'),
    location: m.location || m.meetUrl || '',
    ctz: 'Asia/Ho_Chi_Minh'
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

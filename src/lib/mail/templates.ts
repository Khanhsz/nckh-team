import 'server-only';
import type { Mail } from './smtp';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shell = (body: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#1f1f1f;max-width:560px">${body}<p style="margin-top:24px;font-size:12px;color:#a1a1aa">NCKH Team</p></div>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#0b57d0;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:500">${label}</a></p>`;

export function transferInviteMail(o: { to: string; toName: string; fromName: string; project: string; message: string | null; link: string; expires: string }): Mail {
  const subject = `[NCKH] ${o.fromName} muốn trao quyền trưởng nhóm “${o.project}” cho bạn`;
  const text = [
    `Chào ${o.toName},`,
    '',
    `${o.fromName} muốn trao quyền trưởng nhóm dự án “${o.project}” cho bạn.`,
    o.message ? `Lời nhắn: “${o.message}”` : '',
    '',
    'Khi chấp nhận, bạn sẽ có toàn quyền quản lý dự án (phân công, cài đặt, thành viên); người gửi chuyển thành thành viên.',
    `Xem và trả lời (hạn ${o.expires}): ${o.link}`
  ]
    .filter((l) => l !== null)
    .join('\n');
  const html = shell(
    `<p>Chào ${esc(o.toName)},</p><p><b>${esc(o.fromName)}</b> muốn trao quyền <b>trưởng nhóm</b> dự án <b>“${esc(o.project)}”</b> cho bạn.</p>` +
      (o.message ? `<p style="border-left:3px solid #d4d4d8;padding-left:10px;color:#52525b">${esc(o.message)}</p>` : '') +
      `<p>Khi chấp nhận, bạn có toàn quyền quản lý dự án (phân công, cài đặt, thành viên); người gửi chuyển thành thành viên.</p>` +
      button(o.link, 'Xem và trả lời lời mời') +
      `<p style="font-size:12px;color:#71717a">Lời mời hết hạn ngày ${esc(o.expires)}.</p>`
  );
  return { to: o.to, subject, text, html };
}

export function transferResultMail(o: { to: string; toName: string; byName: string; project: string; accepted: boolean; link: string }): Mail {
  const subject = o.accepted ? `[NCKH] ${o.byName} đã nhận quyền trưởng nhóm “${o.project}”` : `[NCKH] ${o.byName} đã từ chối nhận quyền trưởng nhóm “${o.project}”`;
  const line = o.accepted
    ? `${o.byName} đã chấp nhận. Từ giờ ${o.byName} là trưởng nhóm, bạn là thành viên (quyền chỉnh sửa).`
    : `${o.byName} đã từ chối. Bạn vẫn là trưởng nhóm.`;
  return {
    to: o.to,
    subject,
    text: `Chào ${o.toName},\n\n${line}\n\n${o.link}`,
    html: shell(`<p>Chào ${esc(o.toName)},</p><p>${esc(line)}</p>${button(o.link, 'Mở dự án')}`)
  };
}

/** Thư mời họp / báo đổi giờ / báo huỷ — kèm lời mời lịch (.ics) */
export function meetingMail(o: {
  to: string;
  toName: string;
  kind: 'new' | 'update' | 'cancel';
  byName: string;
  project: string;
  title: string;
  when: string;
  location: string | null;
  meetUrl: string | null;
  notes: string | null;
  googleLink: string;
  appLink: string;
  ics: string;
}): Mail {
  const verb = o.kind === 'new' ? 'Mời họp' : o.kind === 'update' ? 'Đổi lịch họp' : 'Huỷ họp';
  const subject = `[${o.project}] ${verb}: ${o.title} (${o.when})`;
  const lead =
    o.kind === 'new'
      ? `${o.byName} mời bạn họp “${o.title}”.`
      : o.kind === 'update'
        ? `${o.byName} vừa cập nhật cuộc họp “${o.title}”. Lịch của bạn sẽ tự cập nhật nếu đã thêm trước đó.`
        : `${o.byName} đã huỷ cuộc họp “${o.title}”.`;
  const rows: [string, string | null][] = [
    ['Thời gian', o.when],
    ['Địa điểm', o.location],
    ['Link họp', o.meetUrl],
    ['Ghi chú', o.notes]
  ];
  const text = [
    `Chào ${o.toName},`,
    '',
    lead,
    '',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    o.kind === 'cancel' ? '' : `Thêm vào Google Calendar: ${o.googleLink}`,
    `Xem trên Masterplan: ${o.appLink}`
  ].join('\n');
  const table = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#747775;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${
          k === 'Link họp' ? `<a href="${esc(v!)}" style="color:#0b57d0">${esc(v!)}</a>` : esc(v!).replace(/\n/g, '<br>')
        }</td></tr>`
    )
    .join('');
  const html = shell(
    `<p>Chào ${esc(o.toName)},</p><p>${esc(lead)}</p>` +
      `<p style="font-size:18px;margin:16px 0 8px;${o.kind === 'cancel' ? 'text-decoration:line-through;color:#747775' : ''}">${esc(o.title)}</p>` +
      `<table style="border-collapse:collapse;font-size:14px">${table}</table>` +
      (o.kind === 'cancel' ? '' : button(o.googleLink, 'Thêm vào Google Calendar')) +
      `<p style="font-size:12px;color:#747775">Gmail và Outlook cũng hiện sẵn thẻ sự kiện ở đầu thư; tệp invite.ics đính kèm dùng được cho mọi ứng dụng lịch. <a href="${o.appLink}" style="color:#0b57d0">Xem trên Masterplan</a></p>`
  );
  return { to: o.to, subject, text, html, calendar: { method: o.kind === 'cancel' ? 'CANCEL' : 'REQUEST', ics: o.ics } };
}

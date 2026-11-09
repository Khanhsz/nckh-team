import 'server-only';
import type { Mail } from './smtp';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shell = (body: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#18181b;max-width:560px">${body}<p style="margin-top:24px;font-size:12px;color:#a1a1aa">NCKH Team</p></div>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#18181b;color:#fff;padding:9px 16px;text-decoration:none">${label}</a></p>`;

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

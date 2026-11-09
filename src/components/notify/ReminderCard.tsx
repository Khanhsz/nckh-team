'use client';

import { Icon } from '@/components/ui/Icon';
import { useState, useTransition } from 'react';
import { rotateCalendarTokenAction, sendTestMailAction, setDigestAction } from '@/lib/notify/actions';

export function ReminderCard({ calendarUrl, digest, smtpReady, email }: { calendarUrl: string | null; digest: boolean; smtpReady: boolean; email: string }) {
  const [url, setUrl] = useState(calendarUrl);
  const [on, setOn] = useState(digest);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const make = (confirmRotate: boolean) => {
    if (confirmRotate && !window.confirm('Đổi link sẽ làm link cũ ngừng hoạt động (lịch đã thêm sẽ không cập nhật nữa). Tiếp tục?')) return;
    start(async () => {
      const r = await rotateCalendarTokenAction();
      if (r.error) return setMsg(r.error);
      setUrl(r.url!);
      setMsg(null);
    });
  };
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setMsg('Đã sao chép link.');
  };
  const toggle = (v: boolean) =>
    start(async () => {
      setOn(v);
      const r = await setDigestAction(v);
      if (r.error) {
        setOn(!v);
        setMsg(r.error);
      }
    });

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-white p-4 md:grid-cols-2">
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="calendar" size={17} className="text-primary" />Lịch hạn công việc</h2>
        <p className="text-xs text-zinc-600">
          Thêm vào Google Calendar / lịch điện thoại để được nhắc trước 1 ngày. Gồm việc của bạn (kể cả việc cùng làm, việc cả nhóm) và các mốc dự án.
        </p>
        {url ? (
          <>
            <div className="flex gap-1">
              <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 border border-line bg-paper px-2 py-1 font-mono text-[11px]" />
              <button onClick={copy} className="border border-ink-3/50 text-primary px-2 py-1 text-xs font-medium hover:bg-paper-2">
                Sao chép
              </button>
            </div>
            <details className="text-[11px] text-zinc-600">
              <summary className="cursor-pointer">Cách thêm vào Google Calendar</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Mở calendar.google.com trên máy tính → cột trái, cạnh “Lịch khác” bấm <b>+</b> → <b>Từ URL</b>.</li>
                <li>Dán link ở trên → <b>Thêm lịch</b>. Lịch tự đồng bộ sang điện thoại cùng tài khoản.</li>
                <li>Google cập nhật lịch đăng ký vài giờ một lần — không tức thời.</li>
              </ol>
              <p className="mt-1">iPhone: Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm lịch đã đăng ký.</p>
            </details>
            <button onClick={() => make(true)} disabled={pending} className="text-[11px] text-zinc-400 underline hover:text-zinc-700">
              Đổi link (nếu lỡ chia sẻ cho người khác)
            </button>
          </>
        ) : (
          <button onClick={() => make(false)} disabled={pending} className="bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            {pending ? 'Đang tạo…' : 'Tạo link lịch của tôi'}
          </button>
        )}
        <p className="text-[10px] text-zinc-400">Link là riêng của bạn — ai có link sẽ xem được tên việc và hạn của bạn.</p>
      </div>

      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="mail" size={17} className="text-primary" />Email tóm tắt mỗi sáng</h2>
        <p className="text-xs text-zinc-600">
          7h sáng, gửi về <b>{email}</b>: việc quá hạn, việc đến hạn trong 2 ngày, và việc chờ bạn duyệt (nếu là trưởng nhóm). Ngày nào không có gì thì không gửi.
        </p>
        {smtpReady ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={on} disabled={pending} onChange={(e) => toggle(e.target.checked)} />
            Nhận email tóm tắt
          </label>
        ) : null}
        {smtpReady ? (
          <button
            onClick={() =>
              start(async () => {
                setMsg('Đang gửi email thử…');
                try {
                  const r = await sendTestMailAction();
                  setMsg(r.ok ?? r.error ?? null);
                } catch {
                  setMsg('Trang đang mở là bản cũ. Tải lại trang rồi thử lại.');
                }
              })
            }
            disabled={pending}
            className="border border-ink-3/50 px-3 py-1 text-xs text-primary hover:bg-paper-2 disabled:opacity-50"
          >
            Gửi email thử tới tôi
          </button>
        ) : (
          <p className="border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
            Chưa bật: quản trị viên cần cấu hình tài khoản gửi mail (SMTP_USER, SMTP_PASS) trên Vercel. Trong lúc chờ, dùng link lịch bên trái.
          </p>
        )}
        {msg && <p className="text-xs text-zinc-600">{msg}</p>}
      </div>
    </section>
  );
}

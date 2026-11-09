'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Member } from '@/lib/types';
import { cancelTransferAction, requestTransferAction } from '@/app/(app)/projects/[id]/settings/actions';

export function TransferOwnership({
  projectId,
  members,
  pending,
  smtpReady
}: {
  projectId: string;
  members: Member[];
  pending: { id: string; toName: string; expiresAt: string } | null;
  smtpReady: boolean;
}) {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const candidates = members.filter((m) => m.role !== 'owner');

  const send = () => {
    const target = candidates.find((m) => m.userId === to);
    if (!target) return;
    if (!window.confirm(`Gửi lời mời trao quyền trưởng nhóm cho ${target.displayName}? Quyền chỉ đổi khi ${target.displayName} chấp nhận.`)) return;
    start(async () => {
      const r = await requestTransferAction(projectId, to, message);
      if (r.error) return setMsg(r.error);
      setMsg(
        r.emailed
          ? `Đã gửi lời mời và email cho ${target.displayName}.`
          : `Đã gửi lời mời. ${target.displayName} sẽ thấy thông báo khi mở app${smtpReady ? ' (gửi email không thành công)' : ' (chưa cấu hình email)'}.`
      );
      setTo('');
      setMessage('');
      router.refresh();
    });
  };

  const cancel = () =>
    start(async () => {
      const r = await cancelTransferAction(pending!.id);
      setMsg(r.error ?? 'Đã huỷ lời mời.');
      router.refresh();
    });

  if (pending)
    return (
      <div className="space-y-2 text-sm">
        <p className="border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
          Đang chờ <b>{pending.toName}</b> chấp nhận quyền trưởng nhóm (hết hạn {new Date(pending.expiresAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}). Bạn vẫn là
          trưởng nhóm cho tới khi người đó chấp nhận.
        </p>
        <button onClick={cancel} disabled={busy} className="text-xs text-zinc-500 underline hover:text-rose-700">
          Huỷ lời mời
        </button>
        {msg && <p className="text-xs text-zinc-600">{msg}</p>}
      </div>
    );

  if (candidates.length === 0) return <p className="text-sm text-zinc-500">Dự án chưa có thành viên nào khác để trao quyền.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium">Trao cho</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-primary">
            <option value="">— Chọn thành viên —</option>
            {candidates.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
                {m.email ? ` (${m.email})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium">Lời nhắn (tuỳ chọn)</label>
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} className="w-full border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
        </div>
        <button onClick={send} disabled={busy || !to} className="bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40">
          Gửi lời mời
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Người nhận nhận email{smtpReady ? '' : ' (khi đã cấu hình email)'} và thông báo trong app; quyền chỉ chuyển khi họ bấm <b>Chấp nhận</b> (hạn 7 ngày). Sau đó bạn trở thành thành
        viên có quyền chỉnh sửa.
      </p>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </div>
  );
}

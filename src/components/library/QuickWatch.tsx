'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { quickWatchAction } from '@/app/(app)/projects/[id]/settings/actions';

const stripSuffix = (s: string) => s.replace(/[\s,]+(AG|Ltd\.?|Limited|Inc\.?|GmbH|S\.?A\.?|LLC|B\.?V\.?|Pvt\.?)$/i, '').trim();

/** Trưởng nhóm: thêm nhanh NXB / tạp chí của bài vào danh sách theo dõi của nhóm */
export function QuickWatch({ projectId, publisher, journal }: { projectId: string; publisher: string | null; journal: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const add = (kind: 'publisher' | 'journal', name: string) =>
    start(async () => {
      const r = await quickWatchAction(projectId, kind, name);
      setMsg(r.error ?? `Đã thêm “${name}” vào danh sách theo dõi.`);
      router.refresh();
    });
  const pub = publisher ? stripSuffix(publisher) : null;
  if (!pub && !journal) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-zinc-500">👁 Thêm vào danh sách theo dõi của nhóm:</span>
      {pub && (
        <button disabled={pending} onClick={() => add('publisher', pub)} className="border border-yellow-400 bg-yellow-50 px-2 py-0.5 hover:bg-yellow-100 disabled:opacity-50">
          NXB “{pub}”
        </button>
      )}
      {journal && (
        <button disabled={pending} onClick={() => add('journal', journal)} className="border border-yellow-400 bg-yellow-50 px-2 py-0.5 hover:bg-yellow-100 disabled:opacity-50">
          Tạp chí “{journal}”
        </button>
      )}
      <a href={`/projects/${projectId}/settings#watchlist`} className="text-zinc-500 underline">
        quản lý
      </a>
      {msg && <span className="text-zinc-600">{msg}</span>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondTransferAction } from '@/app/(app)/transfer/[id]/actions';

export function TransferResponse({ transferId, compact }: { transferId: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (accept: boolean) => {
    if (accept && !window.confirm('Nhận quyền trưởng nhóm dự án này?')) return;
    start(async () => {
      const r = await respondTransferAction(transferId, accept);
      if (r.error) return setError(r.error);
      if (r.status === 'accepted' && r.projectId) router.push(`/projects/${r.projectId}/settings`);
      else router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => respond(true)} disabled={pending} className={`bg-zinc-900 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 ${compact ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'}`}>
        {pending ? '…' : 'Chấp nhận'}
      </button>
      <button onClick={() => respond(false)} disabled={pending} className={`border border-line hover:bg-paper-2 disabled:opacity-50 ${compact ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'}`}>
        Từ chối
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
